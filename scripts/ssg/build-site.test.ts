import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { SsgError } from "../../src/lib/errors";
import { buildSite, removeStaleDirs } from "./build-site";

const root = resolve(import.meta.dir, "../..");
const cacheRoot = join(root, ".slash-cache");

// Cópia temporária do template dentro de .slash-cache/ (node_modules é resolvido subindo até a raiz real)
async function copyTemplate(name: string): Promise<string> {
  const tmp = join(cacheRoot, `${name}-${process.pid}`);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  for (const dir of ["src", "public", "plugins"]) await cp(join(root, dir), join(tmp, dir), { recursive: true });
  return tmp;
}

// O build principal não toca no dist/ real: assim `bun test` não atropela um dev server em execução
const tmpRoot = join(cacheRoot, `test-build-${process.pid}`);
const dist = join(tmpRoot, "dist");
const read = (rel: string) => readFile(join(dist, rel), "utf8");

let summary: Awaited<ReturnType<typeof buildSite>>;

beforeAll(async () => {
  const tmp = await copyTemplate("test-build");
  summary = await buildSite({ root: tmp, dev: false });
}, 60_000);

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

test("gera um html por URL", () => {
  expect(summary.pages).toBe(5);
  for (const f of [
    "index.html",
    "sobre/index.html",
    "posts/primeiro-post/index.html",
    "posts/segundo-post/index.html",
    "404.html",
  ]) {
    expect(existsSync(join(dist, f))).toBe(true);
  }
});

test("<html lang> vem de site.lang", async () => {
  expect(await read("index.html")).toContain('<html lang="pt-BR">');
});

test("títulos seguem o formato do spec", async () => {
  expect(await read("index.html")).toContain("<title>Slash SSG</title>");
  expect(await read("sobre/index.html")).toContain("<title>Sobre | Slash SSG</title>");
  expect(await read("posts/primeiro-post/index.html")).toContain("<title>Primeiro post | Slash SSG</title>");
});

test("só a home inclui o script do client", async () => {
  const home = await read("index.html");
  const m = home.match(/<script type="module" src="(\/client-[^"]+\.js)"><\/script>/);
  expect(m).not.toBeNull();
  expect(existsSync(join(dist, m?.[1] ?? ""))).toBe(true);
  expect(home).toContain('data-island="counter"');
  expect(home).toContain("Contador: 3");
  expect(home).toContain("1 / 2");
  for (const f of ["sobre/index.html", "posts/primeiro-post/index.html", "404.html"]) {
    expect(await read(f)).not.toContain("<script");
  }
});

test("bundle de produção não referencia __DEV__", async () => {
  const js = (await readdir(dist)).filter((f) => f.endsWith(".js"));
  expect(js.length).toBeGreaterThan(0);
  for (const f of js) expect(await read(f)).not.toContain("__DEV__");
});

test("CSS é linkado e existe em dist", async () => {
  const m = (await read("index.html")).match(/<link rel="stylesheet" href="(\/styles-[0-9a-f]{8}\.css)"/);
  expect(m).not.toBeNull();
  expect(existsSync(join(dist, m?.[1] ?? ""))).toBe(true);
  expect((await readdir(dist)).filter((f) => f.endsWith(".css"))).toHaveLength(1);
});

test("classe do CSS Modules do botão do Counter é a mesma no HTML, no JS do client e no CSS", async () => {
  const home = await read("index.html");
  const cls = home.match(/<button class="([^"]+)" type="button"[^>]*>Contador/)?.[1];
  expect(cls).toBeDefined();
  const clientJs = (await readdir(dist)).find((f) => /^client-.*\.js$/.test(f));
  const css = (await readdir(dist)).find((f) => f.endsWith(".css"));
  expect(await read(clientJs ?? "")).toContain(cls ?? "");
  expect(await read(css ?? "")).toContain(`.${cls}`);
});

test("og:image da home aponta para um JPEG existente em dist/_img", async () => {
  const m = (await read("index.html")).match(
    /<meta property="og:image" content="https:\/\/example\.com(\/_img\/[^"]+-og\.jpg)"/,
  );
  expect(m).not.toBeNull();
  expect(existsSync(join(dist, m?.[1] ?? ""))).toBe(true);
});

test("og:image da home traz width, height e type da variação og, mais o alt", async () => {
  const html = await read("index.html");
  const m = html.match(/<meta property="og:image" content="https:\/\/example\.com(\/_img\/[^"]+-og\.jpg)"/);
  const meta = await sharp(join(dist, m?.[1] ?? "")).metadata();
  expect(html).toContain(`<meta property="og:image:width" content="${meta.width}">`);
  expect(html).toContain(`<meta property="og:image:height" content="${meta.height}">`);
  expect(html).toContain('<meta property="og:image:type" content="image/jpeg">');
  expect(html).toContain('<meta property="og:image:alt" content="Imagem de destaque do Slash SSG">');
  expect(html).toContain('<meta name="twitter:image:alt" content="Imagem de destaque do Slash SSG">');
  // páginas sem imagem não ganham metas de imagem
  expect(await read("sobre/index.html")).not.toContain("og:image");
});

test("nenhuma página do build final traz token de dimensão og", async () => {
  const htmls = [
    "index.html",
    "sobre/index.html",
    "posts/primeiro-post/index.html",
    "posts/segundo-post/index.html",
    "404.html",
  ];
  for (const f of htmls) expect(await read(f)).not.toContain("__SLASH_OG_");
});

test("só a imagem usada em head ganha og no cache e em dist/ (as demais imagens não)", async () => {
  const og = (await readdir(join(dist, "_img"))).filter((f) => f.includes("-og."));
  expect(og).toHaveLength(1);
  expect(og[0]).toStartWith("hero-");
  for (const dir of await readdir(join(tmpRoot, ".slash-cache/images"))) {
    for (const f of await readdir(join(tmpRoot, ".slash-cache/images", dir))) {
      if (f.includes("-og.")) expect(f).toStartWith("hero-");
    }
  }
});

test("JS do client não contém o renderer de string do servidor (htmlString)", async () => {
  const clientJs = (await readdir(dist)).find((f) => /^client-.*\.js$/.test(f)) ?? "";
  const js = await read(clientJs);
  // Mensagem exclusiva de server-render: some do client quando __SERVER__ é false
  const marker = "SSR: Unexpected object in child position";
  expect(js).not.toContain(marker);
  expect(js).not.toContain("data-reactive-value");
  // O bundle de prerender (target node, __SERVER__ true) continua com o renderer de string
  const prerenderJs = await readFile(
    join(
      tmpRoot,
      ".slash-cache/prerender",
      (await readdir(join(tmpRoot, ".slash-cache/prerender"))).find((f) => f.endsWith(".js")) ?? "",
    ),
    "utf8",
  );
  expect(prerenderJs).toContain(marker);
});

test("sitemap tem 4 URLs e não tem /404", async () => {
  const xml = await read("sitemap.xml");
  expect(xml.match(/<loc>/g)).toHaveLength(4);
  expect(xml).not.toContain("/404");
  expect(xml).toContain("<loc>https://example.com/posts/segundo-post/</loc>");
});

test("robots.txt é gerado a partir de site.baseUrl e index.html da casca não é copiado como está", async () => {
  expect(await read("robots.txt")).toBe("User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n");
  expect(await read("index.html")).not.toContain("<!--slash:");
});

test("rota com erro faz buildSite rejeitar com SsgError citando a URL", async () => {
  const tmp = await copyTemplate("test-erro");
  try {
    await writeFile(
      join(tmp, "src/routes.ts"),
      `import type { Route } from "./lib/types";
export const routes: Route[] = [
  { path: "/quebrada", head: { title: "Quebrada" }, page: () => { throw new Error("boom"); } },
  { path: "/404", head: { title: "404" }, page: () => "<h1>404</h1>" },
];\n`,
    );
    const err = await buildSite({ root: tmp, dev: false }).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(SsgError);
    expect((err as Error).message).toContain("/quebrada/");
    expect((err as SsgError).cause).toBeInstanceOf(Error);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}, 60_000);

test("public/robots.txt existente vence o gerado e arquivo de public/ que colide com página gera aviso", async () => {
  const tmp = await copyTemplate("test-public");
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    await writeFile(join(tmp, "public/robots.txt"), "User-agent: bot\nDisallow: /\n");
    await mkdir(join(tmp, "public/sobre"), { recursive: true });
    await writeFile(join(tmp, "public/sobre/index.html"), "<p>colisão</p>");
    await buildSite({ root: tmp, dev: false });
    expect(await readFile(join(tmp, "dist/robots.txt"), "utf8")).toBe("User-agent: bot\nDisallow: /\n");
    expect(warn.mock.calls.some((c) => String(c[0]).includes("public/sobre/index.html"))).toBe(true);
  } finally {
    warn.mockRestore();
    await rm(tmp, { recursive: true, force: true });
  }
}, 60_000);

const routesSource = (routes: string) => `import type { Route } from "./lib/types";\n${routes}\n`;

test("erro lançado no carregamento do bundle (nível de módulo de routes.ts) vira SsgError", async () => {
  const tmp = await copyTemplate("test-carga");
  try {
    await writeFile(
      join(tmp, "src/routes.ts"),
      `import { SsgError } from "./lib/errors";
import type { Route } from "./lib/types";
throw new SsgError("rota inválida no carregamento");
export const routes: Route[] = [];\n`,
    );
    const err = await buildSite({ root: tmp, dev: false }).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(SsgError);
    expect((err as Error).message).toBe("rota inválida no carregamento");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}, 60_000);

test.each([
  ["head undefined", "head: undefined as never, page: () => '<p>x</p>'", "head deve resolver para um objeto"],
  ["head função que resolve para null", "head: () => null as never, page: () => '<p>x</p>'", "(recebido: null)"],
  ["page que não retorna string", "head: { title: 'X' }, page: () => 42 as never", "page deve retornar uma string"],
  ["page que retorna undefined", "head: { title: 'X' }, page: () => undefined as never", "(recebido: undefined)"],
])(
  "%s lança SsgError citando a URL",
  async (_nome, route, esperado) => {
    const tmp = await copyTemplate("test-valida");
    try {
      await writeFile(
        join(tmp, "src/routes.ts"),
        routesSource(`export const routes: Route[] = [
  { path: "/ruim", ${route} },
  { path: "/404", head: { title: "404" }, page: () => "<h1>404</h1>" },
];`),
      );
      const err = await buildSite({ root: tmp, dev: false }).then(
        () => null,
        (e) => e,
      );
      expect(err).toBeInstanceOf(SsgError);
      expect((err as Error).message).toContain("Erro ao renderizar /ruim/");
      expect((err as Error).message).toContain(esperado);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  },
  60_000,
);

test("build com falha não apaga o dist/ anterior nem deixa staging; build com sucesso troca o dist/", async () => {
  const tmp = await copyTemplate("test-swap");
  const leftovers = async () => (await readdir(tmp)).filter((f) => f.startsWith("dist."));
  try {
    await buildSite({ root: tmp, dev: false });
    await writeFile(join(tmp, "dist/marcador.txt"), "build anterior");
    const before = await read2(tmp, "index.html");

    await writeFile(
      join(tmp, "src/routes.ts"),
      routesSource(`export const routes: Route[] = [
  { path: "/quebrada", head: { title: "Q" }, page: () => { throw new Error("boom"); } },
  { path: "/404", head: { title: "404" }, page: () => "<h1>404</h1>" },
];`),
    );
    await expect(buildSite({ root: tmp, dev: false })).rejects.toBeInstanceOf(SsgError);
    expect(await read2(tmp, "marcador.txt")).toBe("build anterior");
    expect(await read2(tmp, "index.html")).toBe(before);
    expect(await leftovers()).toEqual([]);

    // Build bem-sucedido substitui o dist/ por inteiro (o marcador some) e remove o diretório antigo
    await writeFile(
      join(tmp, "src/routes.ts"),
      routesSource(`export const routes: Route[] = [
  { path: "/", head: { title: "Nova" }, page: () => "<h1>nova</h1>" },
  { path: "/404", head: { title: "404" }, page: () => "<h1>404</h1>" },
];`),
    );
    await buildSite({ root: tmp, dev: false });
    expect(existsSync(join(tmp, "dist/marcador.txt"))).toBe(false);
    expect(await read2(tmp, "index.html")).toContain("<title>Nova | Slash SSG</title>");
    expect(await leftovers()).toEqual([]);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}, 120_000);

const read2 = (base: string, rel: string) => readFile(join(base, "dist", rel), "utf8");

test("remove dist.tmp-* e dist.old-* de pids mortos E com mais de 10 min; preserva pids vivos e restos recentes", async () => {
  const tmp = await copyTemplate("test-stale");
  // 2 ** 22 é maior que o pid_max padrão do Linux: nenhum processo tem esse pid
  const dead = 2 ** 22 + 1234;
  const names = {
    tmp: `dist.tmp-${dead}`,
    old: `dist.old-${dead}`,
    alive: `dist.tmp-${process.ppid}`,
    fresh: `dist.tmp-${dead + 1}`,
  };
  try {
    for (const n of Object.values(names)) {
      await mkdir(join(tmp, n), { recursive: true });
      await writeFile(join(tmp, n, "lixo.txt"), "x");
    }
    // Envelhece os candidatos a resto e o de pid vivo; "fresh" (pid morto, recém-modificado) pode ser de
    // um build vivo em outro namespace de pids e fica
    const old = new Date(Date.now() - 11 * 60 * 1000);
    for (const n of [names.tmp, names.old, names.alive]) await utimes(join(tmp, n), old, old);
    await mkdir(join(tmp, "dist.tmp-abc"), { recursive: true });
    await buildSite({ root: tmp, dev: false });
    expect(existsSync(join(tmp, names.tmp))).toBe(false);
    expect(existsSync(join(tmp, names.old))).toBe(false);
    // pid vivo (aqui, o processo pai) pode ser um build em andamento: não é tocado; nomes fora do padrão também não
    expect(existsSync(join(tmp, names.alive))).toBe(true);
    expect(existsSync(join(tmp, names.fresh))).toBe(true);
    expect(existsSync(join(tmp, "dist.tmp-abc"))).toBe(true);
    expect(existsSync(join(tmp, "dist/index.html"))).toBe(true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}, 60_000);

// Guarda "as dimensões vêm do arquivo real" (não deriva de arredondamento: ver a busca no relatório da rodada 4)
test("og:image:width/height emitidos são os do JPEG og realmente gerado (1999x1333)", async () => {
  const tmp = await copyTemplate("test-og-dim");
  try {
    const jpg = await sharp({ create: { width: 1999, height: 1333, channels: 3, background: "#3366cc" } })
      .jpeg()
      .toBuffer();
    await writeFile(join(tmp, "src/assets/images/hero.jpg"), jpg);
    await buildSite({ root: tmp, dev: false });
    const html = await readFile(join(tmp, "dist/index.html"), "utf8");
    const src = html.match(/<meta property="og:image" content="https:\/\/example\.com(\/_img\/[^"]+-og\.jpg)"/)?.[1];
    const real = await sharp(join(tmp, "dist", src ?? "")).metadata();
    expect(html).toContain(`<meta property="og:image:width" content="${real.width}">`);
    expect(html).toContain(`<meta property="og:image:height" content="${real.height}">`);
    expect(real.width).toBe(1200);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}, 60_000);

test("limpeza de staging ignora entrada removida entre o readdir e o stat", async () => {
  const tmp = await copyTemplate("test-stale-race");
  const dead = 2 ** 22 + 99;
  try {
    await mkdir(join(tmp, `dist.tmp-${dead}`), { recursive: true });
    await mkdir(join(tmp, `dist.old-${dead}`), { recursive: true });
    // O stat de dist.tmp-* falha como se outro processo a tivesse removido; a 2ª (antiga) segue sendo tratada
    const old = new Date(Date.now() - 11 * 60 * 1000);
    await utimes(join(tmp, `dist.old-${dead}`), old, old);
    let calls = 0;
    const flaky = ((p: string) => {
      calls++;
      if (p.includes("dist.tmp-")) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return statSync(p);
    }) as typeof statSync;
    expect(() => removeStaleDirs(tmp, flaky)).not.toThrow();
    expect(calls).toBe(2);
    const left = (await readdir(tmp)).filter((f) => f.startsWith("dist."));
    expect(left).toEqual([`dist.tmp-${dead}`]);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("limpeza de staging não engole erros que não sejam ENOENT (ex.: EACCES)", async () => {
  const tmp = await copyTemplate("test-stale-eacces");
  try {
    await mkdir(join(tmp, `dist.tmp-${2 ** 22 + 7}`), { recursive: true });
    const denied = (() => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    }) as unknown as typeof statSync;
    expect(() => removeStaleDirs(tmp, denied)).toThrow("EACCES");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
