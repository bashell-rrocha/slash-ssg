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

function git(dir: string, ...args: string[]): void {
  const proc = Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir });
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
}

function gitProject(): string {
  const dir = project();
  git(dir, "init", "-q");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "inicial");
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

  test("opção desconhecida: sai com 2, mostra o uso e não grava nada", async () => {
    // Arrange
    const dir = project();
    const before = readFileSync(join(dir, "package.json"), "utf8");

    // Act
    const { code, out } = await run(dir, "--without_ui");

    // Assert
    expect(code).toBe(2);
    expect(out).toContain("--without_ui");
    expect(out).toContain("uso: bun run standalone [--without-ui]");
    expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(before);
    expect(existsSync(join(dir, "bunfig.toml"))).toBe(false);
  });

  test("--without-ui lista o que vai apagar", async () => {
    // Arrange
    const dir = project();

    // Act
    const { code, out } = await run(dir, "--without-ui");

    // Assert
    expect(code).toBe(0);
    expect(out).toContain("apaga examples/slash-ui");
  });

  test("--without-ui com outros exemplos: mantém examples/ e o examples/ do script test", async () => {
    // Arrange
    const dir = project();
    mkdirSync(join(dir, "examples", "outro"));
    writeFileSync(join(dir, "examples", "outro", "x.test.ts"), "");

    // Act
    const { code } = await run(dir, "--without-ui");

    // Assert
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(code).toBe(0);
    expect(pkg.scripts.test).toBe("bun test src/ scripts/ examples/");
    expect(existsSync(join(dir, "examples", "outro", "x.test.ts"))).toBe(true);
    expect(existsSync(join(dir, "examples", "slash-ui"))).toBe(false);
  });

  test("--without-ui com mudanças no git em examples/slash-ui: sai com 1 e não grava nem apaga nada", async () => {
    // Arrange
    const dir = gitProject();
    writeFileSync(join(dir, "examples", "slash-ui", "build.ts"), "// mudança do usuário\n");
    const before = readFileSync(join(dir, "package.json"), "utf8");

    // Act
    const { code, out } = await run(dir, "--without-ui");

    // Assert
    expect(code).toBe(1);
    expect(out).toContain("examples/slash-ui");
    expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(before);
    expect(readFileSync(join(dir, "examples", "slash-ui", "build.ts"), "utf8")).toBe("// mudança do usuário\n");
  });

  test("--without-ui com arquivo novo (não rastreado) em examples/slash-ui também recusa", async () => {
    // Arrange
    const dir = gitProject();
    writeFileSync(join(dir, "examples", "slash-ui", "novo.ts"), "");

    // Act
    const { code } = await run(dir, "--without-ui");

    // Assert
    expect(code).toBe(1);
    expect(existsSync(join(dir, "examples", "slash-ui", "novo.ts"))).toBe(true);
  });

  test("--without-ui num repositório git limpo segue normalmente", async () => {
    // Arrange
    const dir = gitProject();

    // Act
    const { code } = await run(dir, "--without-ui");

    // Assert
    expect(code).toBe(0);
    expect(existsSync(join(dir, "examples"))).toBe(false);
  });
});
