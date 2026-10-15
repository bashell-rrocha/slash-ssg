// Preparar o template para rodar fora do monorepo slash-meta (projeto criado pelo "Use this template" do GitHub).
// No monorepo, o slash-ui (privado) vem por workspace:*; fora dele, vem do GitHub Packages (precisa de token com
// read:packages) ou sai junto com o exemplo que o usa (--without-ui). O core já é a versão publicada no npm.

/** O slash-ui fora do monorepo: a versão com que o exemplo (examples/slash-ui) foi testado. */
export const SLASH_UI_PACKAGE = "npm:@bashell-rrocha/slash-ui@^0.5.0";

const SLASH_UI = "@_bashell/slash-ui";
const SCOPE_NAME = "@bashell-rrocha";
const SCOPES_TABLE = "install.scopes";
const SCOPES = `[${SCOPES_TABLE}]`;
const SCOPE = `"${SCOPE_NAME}" = { url = "https://npm.pkg.github.com", token = "$GITHUB_TOKEN" }`;
const UI_SCRIPTS = ["ui:build", "ui:serve"];

type Deps = Record<string, string>;

export interface PackageJson {
  scripts?: Deps;
  dependencies?: Deps;
  devDependencies?: Deps;
  [key: string]: unknown;
}

export interface StandaloneInput {
  pkg: PackageJson;
  /** Conteúdo do bunfig.toml, ou null se não existe. */
  bunfig: string | null;
  withoutUi: boolean;
  /** Com --without-ui: examples/ tem outros exemplos além do slash-ui (o script test continua com examples/). */
  otherExamples?: boolean;
}

export interface StandaloneOutput {
  pkg: PackageJson;
  bunfig: string | null;
  /** Pastas a apagar (relativas à raiz do projeto). */
  removeDirs: string[];
  /** O que ainda impede o `bun install` fora do monorepo. */
  problems: string[];
}

const without = (record: Deps, keys: readonly string[]): Deps =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));

/** Aplica `change` ao campo só se ele existe: package.json sem o campo continua sem ele. */
function mapField(pkg: PackageJson, field: "scripts" | "dependencies" | "devDependencies", change: (v: Deps) => Deps) {
  const value = pkg[field];
  return value === undefined ? {} : { [field]: change(value) };
}

/** Caminho de chave TOML normalizado: `install . "scopes"` → ["install", "scopes"]. */
function keyPath(raw: string): string[] {
  return (raw.match(/"[^"]*"|'[^']*'|[^.\s]+/g) ?? []).map((part) => part.replace(/^["']|["']$/g, ""));
}

/** Tira o comentário da linha (o `#` fora de string). */
function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#") return line.slice(0, i);
  }
  return line;
}

interface ScopesInfo {
  /** O escopo já está definido (em qualquer formato). */
  defined: boolean;
  /** `scopes = { ... }` em linha (sem o escopo): não dá para acrescentar uma tabela. */
  inline: boolean;
  /** Índice da linha `[install.scopes]` (fora de comentário), ou -1. */
  header: number;
}

function scopesInfo(lines: readonly string[]): ScopesInfo {
  const info: ScopesInfo = { defined: false, inline: false, header: -1 };
  let table: string[] = [];
  lines.forEach((raw, index) => {
    const line = stripComment(raw).trim();
    if (line === "") return;
    const header = line.match(/^\[\s*([^[\]]+?)\s*\]$/);
    if (header) {
      table = keyPath(header[1] ?? "");
      if (table.join(".") === SCOPES_TABLE && info.header === -1) info.header = index;
      return;
    }
    if (line.startsWith("[[")) {
      table = ["[["];
      return;
    }
    const eq = line.indexOf("=");
    if (eq === -1) return;
    const key = [...table, ...keyPath(line.slice(0, eq))].join(".");
    const value = line.slice(eq + 1);
    if (key === `${SCOPES_TABLE}.${SCOPE_NAME}`) info.defined = true;
    else if (key === SCOPES_TABLE || key === "install") {
      if (value.includes(SCOPE_NAME)) info.defined = true;
      else if (key === SCOPES_TABLE || /\bscopes\b/.test(value)) info.inline = true;
    }
  });
  return info;
}

function withScope(bunfig: string | null): { bunfig: string | null; problem?: string } {
  if (!bunfig) return { bunfig: `${SCOPES}\n${SCOPE}\n` };
  const lines = bunfig.split("\n");
  const info = scopesInfo(lines);
  if (info.defined) return { bunfig };
  if (info.inline)
    return {
      bunfig,
      problem: `bunfig.toml: os escopos de [install] estão em linha (scopes = { ... }); acrescente à mão: ${SCOPE}`,
    };
  if (info.header !== -1) {
    lines.splice(info.header + 1, 0, SCOPE);
    return { bunfig: lines.join("\n") };
  }
  return { bunfig: `${bunfig.trimEnd()}\n\n${SCOPES}\n${SCOPE}\n` };
}

export function standalone({ pkg, bunfig, withoutUi, otherExamples = false }: StandaloneInput): StandaloneOutput {
  const swap = (deps: Deps): Deps => (SLASH_UI in deps ? { ...deps, [SLASH_UI]: SLASH_UI_PACKAGE } : deps);
  const drop = (deps: Deps): Deps => without(deps, [SLASH_UI]);
  const out: PackageJson = withoutUi
    ? {
        ...pkg,
        ...mapField(pkg, "scripts", (scripts) =>
          Object.fromEntries(
            Object.entries(without(scripts, UI_SCRIPTS)).map(([name, cmd]) => [
              name,
              name === "test" && !otherExamples ? cmd.replace(/\s+examples\/(?=\s|$)/, "") : cmd,
            ]),
          ),
        ),
        ...mapField(pkg, "dependencies", drop),
        ...mapField(pkg, "devDependencies", drop),
      }
    : { ...pkg, ...mapField(pkg, "dependencies", swap), ...mapField(pkg, "devDependencies", swap) };
  const problems = Object.entries({ ...out.dependencies, ...out.devDependencies })
    .filter(([, spec]) => spec.startsWith("workspace:"))
    .map(([name, spec]) => `${name}: "${spec}" não instala fora do monorepo; use a versão publicada`);
  const scoped = withoutUi ? { bunfig } : withScope(bunfig);
  if (scoped.problem) problems.push(scoped.problem);
  return {
    pkg: out,
    bunfig: scoped.bunfig,
    removeDirs: withoutUi ? ["examples/slash-ui"] : [],
    problems,
  };
}
