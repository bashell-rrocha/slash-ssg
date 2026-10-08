import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { SsgError } from "./errors";
import {
  fallbackFormat,
  type ImageManifest,
  type ManifestEntry,
  OG_WIDTH,
  type resolveImagesConfig,
  selectWidths,
  slugifyImagePath,
  type Variant,
  variantUrl,
} from "./image-core";

type Config = ReturnType<typeof resolveImagesConfig>;

const RASTER = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const PASSTHROUGH = new Set([".svg", ".gif"]);

// Lista os arquivos de origem (caminhos relativos com "/"), ignorando dotfiles
function listFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...listFiles(join(dir, d.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

// Executa as tarefas com no máximo `limit` em paralelo. Na primeira falha nenhuma tarefa nova é
// iniciada; as em andamento terminam (nada continua escrevendo em segundo plano) e só então rejeita.
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (!failure && next < items.length) {
      const item = items[next++] as T;
      try {
        await fn(item);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
}

function svgSize(text: string): { width: number; height: number } | null {
  const w = /<svg[^>]*\swidth="([\d.]+)(?:px)?"/.exec(text)?.[1];
  const h = /<svg[^>]*\sheight="([\d.]+)(?:px)?"/.exec(text)?.[1];
  if (w && h) return { width: Math.round(Number(w)), height: Math.round(Number(h)) };
  const vb = /<svg[^>]*\sviewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/.exec(text);
  if (vb) return { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) };
  return null;
}

interface Source {
  rel: string; // caminho no disco (pode estar em NFD)
  key: string; // chave do manifesto (NFC)
  bytes: Buffer;
  hash: string;
  slug: string;
}

function readSource(rel: string, o: ProcessOpts): Source {
  const bytes = readFileSync(join(o.srcDir, rel));
  const hash = createHash("sha256").update(bytes).update(JSON.stringify(o.config)).digest("hex").slice(0, 8);
  return { rel, key: rel.normalize("NFC"), bytes, hash, slug: slugifyImagePath(rel) };
}

async function processOne({ rel, key, bytes, hash, slug }: Source, o: ProcessOpts): Promise<ManifestEntry> {
  const ext = extname(rel).toLowerCase();
  const hashDir = join(o.cacheDir, "images", hash);
  const metaFile = join(hashDir, `${slug}.json`);

  const variantFiles = (e: ManifestEntry) =>
    [e.url, ...Object.values(e.variants).flatMap((vs) => vs.map((v) => v.url))].filter((u): u is string => !!u);

  // Cache só vale se o meta existe, é legível e todas as variantes ainda estão no disco
  let cached: ManifestEntry | null = null;
  if (existsSync(metaFile)) {
    try {
      const parsed = JSON.parse(readFileSync(metaFile, "utf8")) as ManifestEntry;
      if (variantFiles(parsed).every((u) => existsSync(join(hashDir, basename(u))))) cached = parsed;
    } catch {}
  }

  let entry: ManifestEntry;
  if (cached) {
    entry = cached;
    entry.path = key;
  } else {
    mkdirSync(hashDir, { recursive: true });
    try {
      entry = PASSTHROUGH.has(ext)
        ? await buildPassthrough(key, bytes, ext, hash, slug, hashDir)
        : await buildRaster(key, bytes, hash, slug, hashDir, o.config);
    } catch (err) {
      if (err instanceof SsgError) throw err;
      throw new SsgError(`Erro ao processar a imagem "${key}": ${(err as Error).message}`);
    }
    // O meta é gravado por último: um diretório parcial nunca conta como cache
    writeFileSync(metaFile, JSON.stringify(entry));
  }

  mkdirSync(join(o.outDir, "_img"), { recursive: true });
  for (const url of variantFiles(entry)) {
    copyFileSync(join(hashDir, basename(url)), join(o.outDir, "_img", basename(url)));
  }
  return entry;
}

async function buildPassthrough(
  rel: string,
  bytes: Buffer,
  ext: string,
  hash: string,
  slug: string,
  hashDir: string,
): Promise<ManifestEntry> {
  let width: number | undefined;
  let height: number | undefined;
  if (ext === ".svg") {
    const size = svgSize(bytes.toString("utf8"));
    width = size?.width;
    height = size?.height;
  }
  if (!width || !height) {
    const m = await sharp(bytes).metadata();
    width = m.width;
    height = m.pageHeight ?? m.height;
  }
  if (!width || !height) throw new SsgError(`Imagem "${rel}" sem dimensões`);
  const name = `${slug}-${hash}${ext}`;
  writeFileSync(join(hashDir, name), bytes);
  return {
    path: rel,
    kind: "passthrough",
    hash,
    width,
    height,
    format: ext.slice(1),
    hasAlpha: true,
    variants: { avif: [], webp: [], fallback: [] },
    url: `/_img/${name}`,
  };
}

async function buildRaster(
  rel: string,
  bytes: Buffer,
  hash: string,
  slug: string,
  hashDir: string,
  config: Config,
): Promise<ManifestEntry> {
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) throw new SsgError(`Imagem "${rel}" sem dimensões`);
  // Orientações EXIF 5-8 trocam largura e altura depois do rotate()
  const swap = (meta.orientation ?? 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  const format = meta.format === "heif" ? "avif" : (meta.format ?? "");
  const hasAlpha = meta.hasAlpha === true;
  const fb = fallbackFormat(format, hasAlpha);
  const fbExt = fb === "jpeg" ? "jpg" : "png";
  const widths = selectWidths(width, config.widths);
  const variants: ManifestEntry["variants"] = { avif: [], webp: [], fallback: [] };

  const base = (w: number) => sharp(bytes).rotate().resize({ width: w, withoutEnlargement: true }).toColorspace("srgb");
  for (const w of widths) {
    const jobs: [keyof ManifestEntry["variants"], string, () => Promise<Buffer>][] = [
      ["avif", "avif", () => base(w).avif({ quality: config.quality.avif }).toBuffer()],
      ["webp", "webp", () => base(w).webp({ quality: config.quality.webp }).toBuffer()],
      [
        "fallback",
        fbExt,
        () =>
          fb === "jpeg"
            ? base(w).jpeg({ quality: config.quality.jpeg }).toBuffer()
            : base(w).png({ compressionLevel: 9 }).toBuffer(),
      ],
    ];
    for (const [key, e, make] of jobs) {
      const url = variantUrl(slug, hash, w, e);
      writeFileSync(join(hashDir, basename(url)), await make());
      variants[key].push({ width: w, url } satisfies Variant);
    }
  }
  return {
    path: rel,
    kind: "raster",
    hash,
    width,
    height,
    format,
    hasAlpha,
    variants,
    ogUrl: variantUrl(slug, hash, "og", "jpg"),
  };
}

interface ProcessOpts {
  srcDir: string;
  outDir: string;
  cacheDir: string;
  config: Config;
}

export async function processImages(opts: ProcessOpts): Promise<ImageManifest> {
  const files = listFiles(opts.srcDir);
  for (const rel of files) {
    const ext = extname(rel).toLowerCase();
    if (!RASTER.has(ext) && !PASSTHROUGH.has(ext)) {
      throw new SsgError(`Formato de imagem não suportado: "${rel}" (use jpg, jpeg, png, webp, avif, svg ou gif)`);
    }
  }
  // Arquivos com o mesmo (hash, slug) (conteúdo idêntico e nome que resulta no mesmo slug) produzem os
  // mesmos arquivos de saída: processa uma vez só, para nunca escreverem o mesmo caminho em paralelo.
  const groups = new Map<string, Source[]>();
  for (const rel of files) {
    const source = readSource(rel, opts);
    const id = `${source.hash}/${source.slug}`;
    groups.set(id, [...(groups.get(id) ?? []), source]);
  }
  const entries = new Map<string, ManifestEntry>();
  await pool([...groups.values()], availableParallelism(), async (group) => {
    const [first] = group as [Source, ...Source[]];
    const entry = await processOne(first, opts);
    for (const source of group) entries.set(source.key, { ...entry, path: source.key });
  });
  // Ordem estável independente da concorrência; chaves NFC (o mesmo nome em NFD e NFC é uma imagem só)
  const manifest: ImageManifest = new Map(
    files.map((rel) => [rel.normalize("NFC"), entries.get(rel.normalize("NFC")) as ManifestEntry]),
  );
  mkdirSync(opts.cacheDir, { recursive: true });
  writeFileSync(join(opts.cacheDir, "images-manifest.json"), JSON.stringify([...manifest], null, 2));
  return manifest;
}

// Variação JPEG de 1200px para og:image, gerada só para os paths pedidos. Devolve as dimensões reais de cada
// JPEG (por ogUrl), lidas do arquivo gerado ou do cache, para o build trocar os tokens do head.
export async function generateOgImages(
  manifest: ImageManifest,
  paths: Iterable<string>,
  opts: { srcDir: string; outDir: string; cacheDir: string; quality: number },
): Promise<Map<string, { width: number; height: number }>> {
  const dims = new Map<string, { width: number; height: number }>();
  // Chaves distintas com a mesma variação og (conteúdo e slug iguais) geram um arquivo só
  const byOg = new Map<string, string>();
  for (const key of new Set(paths)) {
    const ogUrl = manifest.get(key)?.ogUrl;
    if (ogUrl && !byOg.has(ogUrl)) byOg.set(ogUrl, key);
  }
  const unique = [...byOg.values()];
  // A chave do manifesto é NFC, mas o arquivo no disco pode estar em NFD
  const onDisk = new Map(listFiles(opts.srcDir).map((rel) => [rel.normalize("NFC"), rel]));
  await pool(unique, availableParallelism(), async (key) => {
    const entry = manifest.get(key);
    const rel = onDisk.get(key) ?? key;
    if (!entry?.ogUrl) return;
    const name = basename(entry.ogUrl);
    const hashDir = join(opts.cacheDir, "images", entry.hash);
    const cached = join(hashDir, name);
    if (!existsSync(cached)) {
      try {
        // JPEG de og:image: até OG_WIDTH px de largura (nunca amplia), sRGB, fundo branco no lugar do alfa
        const buf = await sharp(join(opts.srcDir, rel))
          .rotate()
          .resize({ width: OG_WIDTH, withoutEnlargement: true })
          .toColorspace("srgb")
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: opts.quality })
          .toBuffer();
        mkdirSync(hashDir, { recursive: true });
        writeFileSync(cached, buf);
      } catch (err) {
        throw new SsgError(`Erro ao gerar a imagem og de "${rel}": ${(err as Error).message}`);
      }
    }
    const { width, height } = await sharp(cached).metadata();
    if (!width || !height) throw new SsgError(`Imagem og de "${rel}" sem dimensões`);
    dims.set(entry.ogUrl, { width, height });
    mkdirSync(join(opts.outDir, "_img"), { recursive: true });
    copyFileSync(cached, join(opts.outDir, "_img", name));
  });
  return dims;
}
