import { createHash } from "node:crypto";
import { type ContentRecord, type Entry, entries, isRecord } from "./walk";

export type FindingKind = "fictitious" | "placeholder" | "pending";

export interface GateFinding {
  readonly kind: FindingKind;
  readonly path: string;
  readonly sample: string;
  readonly fingerprint: string;
}

export interface ContentRelease {
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly digest: string;
  readonly note: string;
}

export interface GateVerdict {
  readonly open: boolean;
  readonly lines: readonly string[];
}

/** `[TEXTO]` a preencher; `[texto](url)` é link markdown, não placeholder. */
const PLACEHOLDER = /\[[^\]\n]+\](?!\()/;
const SAMPLE_LENGTH = 60;
const KINDS: readonly FindingKind[] = ["fictitious", "placeholder", "pending"];
const RELEASE_FIELDS: readonly string[] = ["approvedBy", "approvedAt", "digest", "note"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function truncate(text: string): string {
  return text.length > SAMPLE_LENGTH ? `${text.slice(0, SAMPLE_LENGTH)}…` : text;
}

function firstString(record: ContentRecord): string {
  const text = Object.values(record).find((value): value is string => typeof value === "string");
  return truncate(text ?? JSON.stringify(record));
}

function finding(kind: FindingKind, path: string, sample: string, value: unknown): GateFinding {
  return { kind, path, sample: truncate(sample), fingerprint: sha256(JSON.stringify(value)) };
}

function pendingOf(record: ContentRecord): string[] {
  const pending = record.pending;
  return Array.isArray(pending) ? pending.filter((item): item is string => typeof item === "string") : [];
}

function findingsAt({ path, value }: Entry): GateFinding[] {
  if (typeof value === "string") return PLACEHOLDER.test(value) ? [finding("placeholder", path, value, value)] : [];
  if (!isRecord(value)) return [];
  const found: GateFinding[] = [];
  if (value.fictitious === true) found.push(finding("fictitious", path, firstString(value), value));
  const pending = pendingOf(value);
  if (pending.length > 0) found.push(finding("pending", path, pending.join("; "), value.pending));
  return found;
}

export function auditContent(root: unknown): GateFinding[] {
  return entries(root).flatMap(findingsAt);
}

export function fictitiousDigest(findings: readonly GateFinding[]): string {
  const lines = findings
    .filter((item) => item.kind === "fictitious")
    .map((item) => `${item.path}:${item.fingerprint}`)
    .sort();
  return sha256(lines.join("\n"));
}

export function parseRelease(text: string): ContentRelease | Error {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  if (!isRecord(data)) return new Error("esperado um objeto JSON");
  const { approvedBy, approvedAt, digest, note } = data;
  if (!isFilled(approvedBy) || !isFilled(approvedAt) || !isFilled(digest) || !isFilled(note)) {
    return new Error(`campos obrigatórios com texto: ${RELEASE_FIELDS.join(", ")}`);
  }
  if (!ISO_DATE.test(approvedAt)) return new Error("approvedAt deve ser AAAA-MM-DD");
  if (!SHA256_HEX.test(digest)) return new Error("digest deve ser um sha256 em hexadecimal");
  return { approvedBy, approvedAt, digest, note };
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function groupLines(findings: readonly GateFinding[]): string[] {
  return KINDS.flatMap((kind) => {
    const group = findings.filter((item) => item.kind === kind);
    if (group.length === 0) return [];
    return [`${kind} (${group.length}):`, ...group.map((item) => `  ${item.path} — ${item.sample}`)];
  });
}

function closedReason(blocking: number, fictitious: number, released: boolean): string | null {
  if (blocking > 0) return "placeholder ou pending nunca são liberáveis";
  if (fictitious > 0 && !released) return "dados fictícios sem liberação válida em content-release.json";
  return null;
}

export function gateVerdict(findings: readonly GateFinding[], release: ContentRelease | null): GateVerdict {
  const fictitious = findings.filter((item) => item.kind === "fictitious").length;
  const blocking = findings.length - fictitious;
  const digest = fictitiousDigest(findings);
  const released = release?.digest === digest;
  const reason = closedReason(blocking, fictitious, released);
  const digestLines = fictitious > 0 ? [`digest: ${digest}`] : [];
  const status = reason === null ? "portão aberto" : `portão fechado: ${reason}`;
  return { open: reason === null, lines: [...groupLines(findings), ...digestLines, status] };
}
