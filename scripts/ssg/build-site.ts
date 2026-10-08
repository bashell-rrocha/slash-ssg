import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { cssModuleTypesPlugin } from "../../plugins/css-types";
import { SsgError } from "../../src/lib/errors";
import { fillOgTokens, hasOgToken, resolveImagesConfig } from "../../src/lib/image-core";
import { generateOgImages, processImages } from "../../src/lib/images-build";
import type { prerender as Prerender } from "../../src/lib/prerender";
import { renderRobots, renderSitemap } from "../../src/lib/sitemap-core";
import type { SiteConfig } from "../../src/lib/types";

export interface BuildSummary {
  pages: number;
  jsBytes: number;
  cssBytes: number;
  ms: number;
}

type Output = { path: string; kind: string };

async function bundle(root: string, entry: string, outdir: string, target: "browser" | "node", dev: boolean) {
  const result = await Bun.build({
    entrypoints: [join(root, entry)],
    outdir,
    target,
    format: "esm",
    minify: !dev,
    naming: dev ? "[name].[ext]" : "[name]-[hash].[ext]",
    define: {
      __DEV__: String(dev),
      // true só no bundle de prerender: o client elimina o renderer de string (htmlString)
      __SERVER__: String(target === "node"),
      "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
    },
    plugins: [cssModuleTypesPlugin({ verbose: false })],
  });
  if (!result.success) {
    const logs = result.logs.map((l) => l.message).join("\n");
    throw new SsgError(`Falha no bundle de ${entry}:\n${logs}`);
  }
  return result.outputs as unknown as Output[];
}

function copyDir(src: string, dest: string, skip: (rel: string) => boolean, rel = ""): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (skip(entryRel)) continue;
    if (entry.isDirectory()) copyDir(join(src, entry.name), join(dest, entry.name), skip, entryRel);
    else copyFileSync(join(src, entry.name), join(dest, entry.name));
  }
}

// Gera o site em um diretório de staging e só no fim troca por dist/: um build que falha (ou o dev
// server servindo durante um rebuild) nunca vê um dist/ vazio ou pela metade.
export async function buildSite(opts: { root: string; dev: boolean }): Promise<BuildSummary> {
  const { root } = opts;
  const finalDist = join(root, "dist");
  const staging = join(root, `dist.tmp-${process.pid}`);
  removeStaleDirs(root);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    const summary = await buildInto(staging, opts);
    swapDist(staging, finalDist);
    return summary;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const STALE_MS = 10 * 60 * 1000;

// Remove restos de builds mortos (kill -9, queda de energia): dist.tmp-<pid> e dist.old-<pid> de outros
// processos. Ficam os de pids vivos (podem ser builds em andamento, ex.: dev e preview ao mesmo tempo) e os
// modificados nos últimos 10 minutos: um build vivo em outro namespace de pids (contêiner) parece "morto"
// daqui, e um build real não passa 10 minutos sem tocar no staging.
export function removeStaleDirs(root: string, stat: typeof statSync = statSync): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const m = /^dist\.(?:tmp|old)-(\d+)$/.exec(entry.name);
    if (!m || !entry.isDirectory()) continue;
    const pid = Number(m[1]);
    if (pid === process.pid || isAlive(pid)) continue;
    const dir = join(root, entry.name);
    // A idade só protege contra namespaces de pids (o pid morto já é o critério de remoção); nada além disso
    let mtimeMs: number;
    try {
      mtimeMs = stat(dir).mtimeMs;
    } catch (err) {
      // Removido por outro processo entre o readdir e o stat: pula. Outros erros (ex.: EACCES) não são engolidos
      if ((err as { code?: string }).code === "ENOENT") continue;
      throw err;
    }
    if (Date.now() - mtimeMs < STALE_MS) continue;
    rmSync(dir, { recursive: true, force: true });
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: o processo existe, mas é de outro usuário
    return (err as { code?: string }).code === "EPERM";
  }
}

// Troca em dois renames (não existe rename atômico de diretório sobre diretório não vazio): por um
// instante dist/ não existe; o dev server espera esse intervalo (ver serve.ts). Passos: renomeia o
// dist/ antigo, move o novo para o lugar e só então remove o antigo (se a 2ª troca falhar, o antigo volta)
function swapDist(staging: string, finalDist: string): void {
  const old = `${finalDist}.old-${process.pid}`;
  rmSync(old, { recursive: true, force: true });
  const hadOld = existsSync(finalDist);
  if (hadOld) renameSync(finalDist, old);
  try {
    renameSync(staging, finalDist);
  } catch (err) {
    if (hadOld) renameSync(old, finalDist);
    throw err;
  }
  rmSync(old, { recursive: true, force: true });
}

async function buildInto(dist: string, opts: { root: string; dev: boolean }): Promise<BuildSummary> {
  const { root, dev } = opts;
  const started = performance.now();
  const cacheDir = join(root, ".slash-cache");
  const prerenderDir = join(cacheDir, "prerender");

  // 1. Limpa o bundle de prerender anterior (dist/ é o staging, já vazio)
  rmSync(prerenderDir, { recursive: true, force: true });

  // 2. Bundle do browser: o CSS dele é descartado (o CSS do site vem do bundle de prerender)
  const clientOutputs = await bundle(root, "src/client.ts", dist, "browser", dev);
  for (const o of clientOutputs) if (o.path.endsWith(".css")) rmSync(o.path, { force: true });
  const clientJsOutputs = clientOutputs.filter((o) => o.path.endsWith(".js"));
  const clientEntry = clientOutputs.find((o) => o.kind === "entry-point") ?? clientJsOutputs[0];
  if (!clientEntry) throw new SsgError("O bundle do client não gerou nenhum arquivo JS");
  const clientJs = clientEntry.path.slice(dist.length + 1);
  const jsBytes = clientJsOutputs.reduce((sum, o) => sum + statSync(o.path).size, 0);

  // 3. Bundle do servidor: gera o JS de prerender e o CSS do site. target "node" (e não "bun") porque o
  // @_bashell/slash publicado no npm tem a condição de export "bun" apontando para src/, que não é distribuído.
  const serverOutputs = await bundle(root, "src/lib/prerender.ts", prerenderDir, "node", dev);
  const serverJs = serverOutputs.find((o) => o.kind === "entry-point");
  const serverCss = serverOutputs.find((o) => o.path.endsWith(".css"));
  if (!serverJs) throw new SsgError("O bundle de prerender não gerou o JS de entrada");
  // Site sem CSS Modules importado é válido: não há stylesheet para linkar
  let cssName: string | null = null;
  let cssBytes = 0;
  if (serverCss) {
    const cssBuf = readFileSync(serverCss.path);
    cssName = dev ? "styles.css" : `styles-${createHash("sha256").update(cssBuf).digest("hex").slice(0, 8)}.css`;
    writeFileSync(join(dist, cssName), cssBuf);
    cssBytes = cssBuf.length;
  }

  // 4. Imagens (site.ts não importa CSS, então pode ser carregado direto)
  // O "?t=" faz o import ignorar a instância já carregada: o registro de módulos do ESM nunca descarta
  // instâncias, então cada chamada de buildSite no mesmo processo deixa a sua na memória. Isso não
  // acumula na prática: scripts/build.ts roda um build e sai (one-shot) e o dev roda cada rebuild em
  // um subprocesso novo (scripts/dev.ts), então o cache de módulos nunca serve páginas antigas.
  const stamp = `?t=${Date.now()}`;
  const { site } = (await import(join(root, "src/site.ts") + stamp)) as { site: SiteConfig };
  const config = resolveImagesConfig(site.images);
  const srcDir = join(root, "src/assets/images");
  const manifest = await processImages({ srcDir, outDir: dist, cacheDir, config });

  // 5. Prerender em memória
  const shell = readFileSync(join(root, "public/index.html"), "utf8");
  let result: Awaited<ReturnType<typeof Prerender>>;
  try {
    const mod = (await import(serverJs.path + stamp)) as { prerender: typeof Prerender };
    result = await mod.prerender({
      manifest: [...manifest],
      shell,
      cssHrefs: cssName ? [`/${cssName}`] : [],
      scriptSrc: `/${clientJs}`,
      devReload: dev,
    });
  } catch (err) {
    // O SsgError do bundle é outra classe (também no carregamento do módulo): reempacota para instanceof funcionar
    if (err instanceof Error && err.name === "SsgError" && !(err instanceof SsgError)) {
      throw new SsgError(err.message, { cause: err.cause });
    }
    throw err;
  }
  const { pages, ogRequests } = result;

  // 6. Imagens og:image pedidas durante a renderização (só as pedidas), com as dimensões reais lidas dos JPEGs
  const ogDims = await generateOgImages(manifest, ogRequests, {
    srcDir,
    outDir: dist,
    cacheDir,
    quality: config.quality.jpeg,
  });

  // 7. Escreve as páginas, trocando os tokens de og:image:width/height; um token nunca chega ao HTML final
  const generated = new Set(pages.map((p) => p.file));
  for (const page of pages) {
    const html = fillOgTokens(page.html, ogDims, page.url);
    if (hasOgToken(html)) throw new SsgError(`Página ${page.url}: token de dimensão og não substituído`);
    const out = join(dist, page.file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
  }

  // 8. public/ (exceto a casca)
  const publicDir = join(root, "public");
  if (existsSync(publicDir)) {
    copyDir(publicDir, dist, (rel) => {
      if (rel === "index.html") return true;
      if (generated.has(rel)) {
        console.warn(`Aviso: public/${rel} sobrescreve a página gerada com o mesmo caminho`);
      }
      return false;
    });
  }

  // 9. Sitemap e robots.txt (o de public/ tem prioridade)
  if (!existsSync(join(publicDir, "robots.txt"))) writeFileSync(join(dist, "robots.txt"), renderRobots(site.baseUrl));
  writeFileSync(join(dist, "sitemap.xml"), renderSitemap(site.baseUrl, pages));

  return { pages: pages.length, jsBytes, cssBytes, ms: Math.round(performance.now() - started) };
}
