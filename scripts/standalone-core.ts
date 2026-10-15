// Preparar o template para rodar fora do monorepo slash-meta (projeto criado pelo "Use this template" do GitHub).
// No monorepo, o slash-ui (privado) vem por workspace:*; fora dele, vem do GitHub Packages (precisa de token com
// read:packages) ou sai junto com o exemplo que o usa (--without-ui). O core já é a versão publicada no npm.

/** O slash-ui fora do monorepo: a versão com que o exemplo (examples/slash-ui) foi testado. */
export const SLASH_UI_PACKAGE = "npm:@bashell-rrocha/slash-ui@^0.5.0";

const SLASH_UI = "@_bashell/slash-ui";
const SCOPES = "[install.scopes]";
const SCOPE = '"@bashell-rrocha" = { url = "https://npm.pkg.github.com", token = "$GITHUB_TOKEN" }';
const UI_SCRIPTS = ["ui:build", "ui:serve"];

export interface PackageJson {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  [key: string]: unknown;
}

export interface StandaloneInput {
  pkg: PackageJson;
  /** Conteúdo do bunfig.toml, ou null se não existe. */
  bunfig: string | null;
  withoutUi: boolean;
}

export interface StandaloneOutput {
  pkg: PackageJson;
  bunfig: string | null;
  /** Pastas a apagar (relativas à raiz do projeto). */
  removeDirs: string[];
  /** O que ainda impede o `bun install` fora do monorepo. */
  problems: string[];
}

const without = (record: Record<string, string>, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));

function withScope(bunfig: string | null): string {
  if (bunfig?.includes(SCOPE)) return bunfig;
  if (!bunfig) return `${SCOPES}\n${SCOPE}\n`;
  if (bunfig.includes(SCOPES)) return bunfig.replace(SCOPES, `${SCOPES}\n${SCOPE}`);
  return `${bunfig.trimEnd()}\n\n${SCOPES}\n${SCOPE}\n`;
}

export function standalone({ pkg, bunfig, withoutUi }: StandaloneInput): StandaloneOutput {
  const out: PackageJson = withoutUi
    ? {
        ...pkg,
        scripts: Object.fromEntries(
          Object.entries(without(pkg.scripts, UI_SCRIPTS)).map(([name, cmd]) => [
            name,
            name === "test" ? cmd.replace(/\s+examples\/(?=\s|$)/, "") : cmd,
          ]),
        ),
        dependencies: without(pkg.dependencies, [SLASH_UI]),
        devDependencies: without(pkg.devDependencies, [SLASH_UI]),
      }
    : {
        ...pkg,
        devDependencies:
          SLASH_UI in pkg.devDependencies
            ? { ...pkg.devDependencies, [SLASH_UI]: SLASH_UI_PACKAGE }
            : pkg.devDependencies,
        dependencies:
          SLASH_UI in pkg.dependencies ? { ...pkg.dependencies, [SLASH_UI]: SLASH_UI_PACKAGE } : pkg.dependencies,
      };
  const problems = Object.entries({ ...out.dependencies, ...out.devDependencies })
    .filter(([, spec]) => spec.startsWith("workspace:"))
    .map(([name, spec]) => `${name}: "${spec}" não instala fora do monorepo; use a versão publicada`);
  return {
    pkg: out,
    bunfig: withoutUi ? bunfig : withScope(bunfig),
    removeDirs: withoutUi ? ["examples/slash-ui"] : [],
    problems,
  };
}
