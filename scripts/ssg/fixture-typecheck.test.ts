import { afterAll, expect, test } from "bun:test";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// O build-site.test.ts monta o site da fixture (__fixtures__/site/src) sobre src/lib, e o tsconfig.json do projeto
// exclui a fixture. Este teste fecha a brecha: se a API de src/lib mudar de tipo, a fixture tem de acompanhar.
const root = resolve(import.meta.dir, "../..");
const fixtureSrc = join(import.meta.dir, "__fixtures__/site/src");
const tmp = join(root, ".slash-cache", `fixture-typecheck-${process.pid}`);

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test("a fixture do site passa no tsc sobre o src/lib atual", async () => {
  // Arrange
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  await cp(join(root, "src/lib"), join(tmp, "src/lib"), { recursive: true });
  await cp(fixtureSrc, join(tmp, "src"), { recursive: true });
  await cp(join(root, "global.d.ts"), join(tmp, "global.d.ts"));
  const tsconfig = {
    extends: join(root, "tsconfig.json"),
    include: ["src", "global.d.ts"],
    exclude: ["src/**/*.test.ts"],
  };
  await writeFile(join(tmp, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));
  const tsc = Bun.resolveSync("typescript/bin/tsc", root);

  // Act
  const proc = Bun.spawn([process.execPath, tsc, "--noEmit", "-p", tmp], { cwd: tmp, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  // Assert
  expect(out + err).toBe("");
  expect(code).toBe(0);
}, 120_000);
