import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./serve";

const dist = mkdtempSync(join(tmpdir(), "slash-ssg-serve-"));
let dev: ReturnType<typeof startServer>;
let preview: ReturnType<typeof startServer>;

beforeAll(() => {
  mkdirSync(join(dist, "sobre"));
  writeFileSync(join(dist, "sobre/index.html"), "<p>sobre</p>");
  writeFileSync(join(dist, "404.html"), "<p>404</p>");
  dev = startServer({ dist, port: 0, dev: true });
  preview = startServer({ dist, port: 0, dev: false });
});

afterAll(() => {
  dev.stop();
  preview.stop();
  rmSync(dist, { recursive: true, force: true });
});

test("redirect /x -> /x/ é 302 no dev e 301 no preview", async () => {
  const d = await fetch(`http://localhost:${dev.port}/sobre?a=1`, { redirect: "manual" });
  expect(d.status).toBe(302);
  expect(d.headers.get("location")).toBe(`http://localhost:${dev.port}/sobre/?a=1`);
  const p = await fetch(`http://localhost:${preview.port}/sobre`, { redirect: "manual" });
  expect(p.status).toBe(301);
});

test("SSE do dev não envia connection: keep-alive e o preview não expõe /__reload", async () => {
  const controller = new AbortController();
  const res = await fetch(`http://localhost:${dev.port}/__reload`, { signal: controller.signal });
  expect(res.headers.get("content-type")).toBe("text/event-stream");
  expect(res.headers.get("cache-control")).toBe("no-cache");
  expect(res.headers.get("connection")).toBeNull();
  controller.abort();
  expect((await fetch(`http://localhost:${preview.port}/__reload`)).status).toBe(404);
});

test("idleTimeout: 0 só no dev (SSE sem limite); o preview mantém o padrão", () => {
  const serve = spyOn(Bun, "serve");
  const servers = [startServer({ dist, port: 0, dev: true }), startServer({ dist, port: 0, dev: false })];
  try {
    const [devOpts, previewOpts] = serve.mock.calls.map((c) => c[0] as { idleTimeout?: number });
    expect(devOpts?.idleTimeout).toBe(0);
    expect(previewOpts).not.toHaveProperty("idleTimeout");
  } finally {
    for (const sv of servers) sv.stop();
    serve.mockRestore();
  }
});

// Espera o fetch ainda não ter resolvido depois de um intervalo curto: prova que o servidor está esperando
async function stillPending(p: Promise<unknown>): Promise<boolean> {
  let settled = false;
  p.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await Bun.sleep(100);
  return !settled;
}

test("dev espera dist/ reaparecer durante a troca do rebuild e só então responde", async () => {
  const away = `${dist}.away`;
  renameSync(dist, away);
  try {
    const res = fetch(`http://localhost:${dev.port}/sobre/`);
    // Evento explícito: dist/ só volta depois de observar a requisição esperando (e não antes)
    expect(await stillPending(res)).toBe(true);
    renameSync(away, dist);
    const done = await res;
    expect(done.status).toBe(200);
    expect(await done.text()).toBe("<p>sobre</p>");
  } finally {
    if (existsSync(away)) renameSync(away, dist);
  }
});

test("dist/ ausente de vez: preview responde 404 e o dev também, depois da espera máxima", async () => {
  const away = `${dist}.away`;
  renameSync(dist, away);
  try {
    const t0 = performance.now();
    expect((await fetch(`http://localhost:${preview.port}/sobre/`)).status).toBe(404);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect((await fetch(`http://localhost:${dev.port}/sobre/`)).status).toBe(404);
  } finally {
    renameSync(away, dist);
  }
});

test("dev: dist/ some entre o stat e a leitura do arquivo (ENOENT) e a requisição tenta de novo", async () => {
  const away = `${dist}.away`;
  const realFile = Bun.file.bind(Bun);
  let hits = 0;
  // Simula a corrida: na 1ª leitura do arquivo, dist/ acaba de ser renomeado (depois do isFile)
  const spy = spyOn(Bun, "file").mockImplementation(((...args: Parameters<typeof Bun.file>) => {
    if (hits++ === 0) {
      renameSync(dist, away);
      setTimeout(() => renameSync(away, dist), 100);
    }
    return realFile(...args);
  }) as typeof Bun.file);
  try {
    const res = await fetch(`http://localhost:${dev.port}/sobre/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<p>sobre</p>");
    expect(hits).toBeGreaterThanOrEqual(2);
  } finally {
    spy.mockRestore();
    if (existsSync(away)) renameSync(away, dist);
  }
});

test("dev serve em stream um arquivo maior que 1 MB com content-type e tamanho corretos", async () => {
  const big = Buffer.alloc(1024 * 1024 + 4096, 7);
  const bigFile = join(dist, "grande.js");
  try {
    writeFileSync(bigFile, big);
    const res = await fetch(`http://localhost:${dev.port}/grande.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/javascript");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.length).toBe(big.length);
    expect(body[0]).toBe(7);
    expect(body[body.length - 1]).toBe(7);
    // Um arquivo pequeno continua com content-type correto no caminho em memória
    const small = await fetch(`http://localhost:${dev.port}/sobre/`);
    expect(small.headers.get("content-type")).toStartWith("text/html");
  } finally {
    rmSync(bigFile, { force: true });
  }
});
