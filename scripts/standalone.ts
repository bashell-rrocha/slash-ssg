// bun run standalone [--without-ui]: prepara um projeto criado do template para rodar fora do monorepo slash-meta.
// Roda antes do `bun install` (só node:fs). Ver scripts/standalone-core.ts e o README → "Fora do monorepo".
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type PackageJson, standalone } from "./standalone-core";

const root = process.cwd();
const withoutUi = process.argv.includes("--without-ui");
const pkgFile = join(root, "package.json");
const bunfigFile = join(root, "bunfig.toml");

const result = standalone({
  pkg: JSON.parse(readFileSync(pkgFile, "utf8")) as PackageJson,
  bunfig: existsSync(bunfigFile) ? readFileSync(bunfigFile, "utf8") : null,
  withoutUi,
});

if (result.problems.length > 0) {
  for (const problem of result.problems) console.error(`✗ ${problem}`);
  process.exit(1);
}

writeFileSync(pkgFile, `${JSON.stringify(result.pkg, null, 2)}\n`);
if (result.bunfig !== null) writeFileSync(bunfigFile, result.bunfig);
for (const dir of result.removeDirs) rmSync(join(root, dir), { recursive: true, force: true });
const examples = join(root, "examples");
if (existsSync(examples) && readdirSync(examples).length === 0) rmSync(examples, { recursive: true });

console.log(
  withoutUi
    ? "ok: sem o slash-ui. Próximo passo: bun install"
    : "ok: slash-ui pelo GitHub Packages. Próximo passo: GITHUB_TOKEN=$(gh auth token) bun install",
);
