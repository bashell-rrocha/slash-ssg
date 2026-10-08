import { afterAll, beforeAll, expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

// Porta ocupada por um Bun.serve do próprio teste
let busy: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  busy = Bun.serve({ port: 0, fetch: () => new Response("ocupada") });
});
afterAll(() => busy.stop(true));

async function run(script: string, port: string) {
  const proc = Bun.spawn(["bun", "run", script], {
    cwd: root,
    env: { ...process.env, PORT: port },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  return { stderr, code };
}

test.each([
  "scripts/preview.ts",
  "scripts/dev.ts",
])("%s numa porta ocupada sai com 1 e mensagem em português", async (script) => {
  const { stderr, code } = await run(script, String(busy.port));
  expect(code).toBe(1);
  expect(stderr).toContain(`A porta ${busy.port} já está em uso`);
  expect(stderr).toContain(`PORT=${(busy.port as number) + 1}`);
});

test.each([
  "scripts/preview.ts",
  "scripts/dev.ts",
])("%s com PORT inválida sai com 1 e mensagem em português", async (script) => {
  const { stderr, code } = await run(script, "abc");
  expect(code).toBe(1);
  expect(stderr).toContain('PORT inválida: "abc"');
});

test("playwright.config.ts com PORT inválida lança erro em português", async () => {
  const proc = Bun.spawn(["bun", "-e", 'await import("./playwright.config.ts")'], {
    cwd: root,
    env: { ...process.env, PORT: "70000" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  expect(code).not.toBe(0);
  expect(stderr).toContain('PORT inválida: "70000"');
});
