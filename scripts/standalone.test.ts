import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SLASH_UI_PACKAGE } from "./standalone-core";

// O comando de verdade numa cópia mínima do projeto (package.json, examples/slash-ui), sem bun install. O package.json
// é fixo, como o do template no monorepo: o do projeto muda depois do próprio standalone.
const PKG = {
  name: "slash-ssg",
  scripts: { test: "bun test src/ scripts/ examples/", "ui:build": "bun run examples/slash-ui/build.ts" },
  dependencies: { "@_bashell/slash": "^0.0.6" },
  devDependencies: { "@_bashell/slash-ui": "workspace:*" },
};

const SCRIPT = join(import.meta.dir, "standalone.ts");
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "standalone-"));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify(PKG, null, 2));
  mkdirSync(join(dir, "examples", "slash-ui"), { recursive: true });
  writeFileSync(join(dir, "examples", "slash-ui", "build.ts"), "");
  return dir;
}

async function run(dir: string, ...args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["bun", SCRIPT, ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: out + err };
}

describe("bun run standalone", () => {
  test("com o slash-ui: package.json e bunfig.toml prontos para o GitHub Packages", async () => {
    // Arrange
    const dir = project();

    // Act
    const { code } = await run(dir);

    // Assert
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(code).toBe(0);
    expect(pkg.devDependencies["@_bashell/slash-ui"]).toBe(SLASH_UI_PACKAGE);
    expect(readFileSync(join(dir, "bunfig.toml"), "utf8")).toContain(
      '"@bashell-rrocha" = { url = "https://npm.pkg.github.com"',
    );
    expect(existsSync(join(dir, "examples", "slash-ui"))).toBe(true);
  });

  test("--without-ui: sem slash-ui, sem o exemplo e sem a pasta examples/ vazia", async () => {
    // Arrange
    const dir = project();

    // Act
    const { code } = await run(dir, "--without-ui");

    // Assert
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(code).toBe(0);
    expect(JSON.stringify(pkg)).not.toContain("slash-ui");
    expect(existsSync(join(dir, "examples"))).toBe(false);
    expect(existsSync(join(dir, "bunfig.toml"))).toBe(false);
  });

  test("dependência que ainda está em workspace: sai com erro e não grava nada", async () => {
    // Arrange
    const dir = project();
    const file = join(dir, "package.json");
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    pkg.dependencies["@_bashell/slash"] = "workspace:*";
    writeFileSync(file, JSON.stringify(pkg, null, 2));
    const before = readFileSync(file, "utf8");

    // Act
    const { code, out } = await run(dir);

    // Assert
    expect(code).toBe(1);
    expect(out).toContain("@_bashell/slash");
    expect(readFileSync(file, "utf8")).toBe(before);
  });
});
