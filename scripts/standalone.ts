// bun run standalone [--without-ui]: prepara um projeto criado do template para rodar fora do monorepo slash-meta.
// Roda antes do `bun install` (só node:*). Ver scripts/standalone-core.ts e o README → "Criar um projeto derivado".
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type PackageJson, standalone } from "./standalone-core";

const USAGE = "uso: bun run standalone [--without-ui]";
const UI_EXAMPLE = "examples/slash-ui";

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--without-ui");
if (unknown.length > 0) {
  console.error(`✗ opção desconhecida: ${unknown.join(" ")}\n${USAGE}`);
  process.exit(2);
}

const root = process.cwd();
const withoutUi = args.includes("--without-ui");
const pkgFile = join(root, "package.json");
const bunfigFile = join(root, "bunfig.toml");
const examples = join(root, "examples");

/** Mudanças no git dentro de `dir` (vazio fora de um repositório git ou sem o git instalado). */
function gitChanges(dir: string): string {
  const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, encoding: "utf8" });
  if (inside.status !== 0 || inside.stdout.trim() !== "true") return "";
  const status = spawnSync("git", ["status", "--porcelain", "--", dir], { cwd: root, encoding: "utf8" });
  return status.status === 0 ? status.stdout.trim() : "";
}

if (withoutUi) {
  const changes = gitChanges(UI_EXAMPLE);
  if (changes) {
    console.error(`✗ ${UI_EXAMPLE} tem mudanças no git; salve-as em outro lugar (ou descarte) antes:\n${changes}`);
    process.exit(1);
  }
}

const otherExamples = existsSync(examples) && readdirSync(examples).some((entry) => entry !== "slash-ui");
const result = standalone({
  pkg: JSON.parse(readFileSync(pkgFile, "utf8")) as PackageJson,
  bunfig: existsSync(bunfigFile) ? readFileSync(bunfigFile, "utf8") : null,
  withoutUi,
  otherExamples,
});

if (result.problems.length > 0) {
  for (const problem of result.problems) console.error(`✗ ${problem}`);
  process.exit(1);
}

const removeDirs = result.removeDirs.filter((dir) => existsSync(join(root, dir)));
if (removeDirs.length > 0 && !otherExamples) removeDirs.push("examples");
for (const dir of removeDirs) console.log(`apaga ${dir}/`);

writeFileSync(pkgFile, `${JSON.stringify(result.pkg, null, 2)}\n`);
if (result.bunfig !== null) writeFileSync(bunfigFile, result.bunfig);
for (const dir of removeDirs) rmSync(join(root, dir), { recursive: true, force: true });

console.log(
  withoutUi
    ? "ok: sem o slash-ui. Próximo passo: bun install"
    : "ok: slash-ui pelo GitHub Packages. Próximo passo: GITHUB_TOKEN=$(gh auth token) bun install",
);
