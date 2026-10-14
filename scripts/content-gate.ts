import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditContent, gateVerdict, parseRelease } from "../src/data/gate";
import { allContent } from "../src/data/index";

export interface GateRun {
  readonly code: 0 | 1;
  readonly out: string;
}

const RELEASE_FILE = "content-release.json";

export function runGate(content: unknown, releaseText: string | null): GateRun {
  const release = releaseText === null ? null : parseRelease(releaseText);
  if (release instanceof Error) return { code: 1, out: `${RELEASE_FILE} inválido: ${release.message}` };
  const verdict = gateVerdict(auditContent(content), release);
  return { code: verdict.open ? 0 : 1, out: verdict.lines.join("\n") };
}

if (import.meta.main) {
  const releasePath = resolve(import.meta.dir, "..", RELEASE_FILE);
  const releaseText = existsSync(releasePath) ? readFileSync(releasePath, "utf8") : null;
  const { code, out } = runGate(allContent, releaseText);
  console.log(out);
  process.exit(code);
}
