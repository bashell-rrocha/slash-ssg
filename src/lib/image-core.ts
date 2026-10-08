import { SsgError } from "./errors";
import type { ImagesConfig } from "./types";

export const DEFAULT_IMAGE_WIDTHS = [480, 960, 1440, 1920];
export const DEFAULT_IMAGE_QUALITY = { avif: 50, webp: 75, jpeg: 80 };

export interface Variant {
  width: number;
  url: string;
}

export interface ManifestEntry {
  path: string;
  kind: "raster" | "passthrough";
  hash: string;
  width: number;
  height: number;
  format: string;
  hasAlpha: boolean;
  variants: { avif: Variant[]; webp: Variant[]; fallback: Variant[] }; // vazios em passthrough
  url?: string; // passthrough (svg/gif)
  ogUrl?: string; // raster: "/_img/<nome>-<hash>-og.jpg" (o arquivo só é gerado se usado)
}

export type ImageManifest = Map<string, ManifestEntry>;

export interface ImageDescriptor {
  alt: string;
  width: number;
  height: number;
  src: string;
  sources: { type: string; srcset: string }[];
  fallbackSrcset: string;
}

export interface PictureOptions {
  sizes?: string;
  priority?: boolean;
  class?: string;
}

export function resolveImagesConfig(c?: ImagesConfig): {
  widths: number[];
  quality: { avif: number; webp: number; jpeg: number };
} {
  return {
    widths: c?.widths ?? DEFAULT_IMAGE_WIDTHS,
    quality: { ...DEFAULT_IMAGE_QUALITY, ...c?.quality },
  };
}

// Nunca amplia: descarta larguras acima do original e inclui o original quando ele é menor que a maior configurada
export function selectWidths(original: number, widths: number[]): number[] {
  const set = new Set(widths.filter((w) => w <= original));
  if (widths.length > 0 && original < Math.max(...widths)) set.add(original);
  return [...set].sort((a, b) => a - b);
}

export function fallbackFormat(format: string, hasAlpha: boolean): "jpeg" | "png" {
  if (format === "jpeg" || format === "jpg") return "jpeg";
  return hasAlpha ? "png" : "jpeg";
}

// "mockups/Mockup Clínica.PNG" → "mockups-mockup-clinica"; nomes sem nenhum caractere ASCII
// aproveitável (ex.: "日本.png") caem em "img"
export function slugifyImagePath(relPath: string): string {
  const slug = relPath
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "img" : slug;
}

export interface OgImage {
  url: string; // absoluta
  // Só para imagens locais raster (variação og). Durante a renderização são tokens (ogToken); o build
  // os troca pelas dimensões reais do JPEG depois de gerá-lo (fillOgTokens).
  width?: number | string;
  height?: number | string;
  type?: string;
}

export const OG_WIDTH = 1200;

// As dimensões reais do JPEG og só existem depois de gerá-lo (e o sharp decide o arredondamento), mas o
// head é renderizado antes: emite um token por variação og, trocado em fillOgTokens após a geração.
export const ogToken = (ogUrl: string, dim: "width" | "height"): string =>
  `__SLASH_OG_${dim === "width" ? "W" : "H"}[${ogUrl}]__`;

const OG_TOKEN = /__SLASH_OG_([WH])\[([^\]]*)\]__/g;

// Troca os tokens pelas dimensões reais; token sem dimensão conhecida é erro (nunca vai para o HTML final)
export function fillOgTokens(html: string, dims: Map<string, { width: number; height: number }>, page: string): string {
  return html.replace(OG_TOKEN, (_m, dim: string, ogUrl: string) => {
    const d = dims.get(ogUrl);
    if (!d) throw new SsgError(`Página ${page}: dimensões da imagem og "${ogUrl}" não encontradas`);
    return String(dim === "W" ? d.width : d.height);
  });
}

export const hasOgToken = (html: string): boolean => new RegExp(OG_TOKEN.source).test(html);

export function variantUrl(slug: string, hash: string, width: number | "og", ext: string): string {
  return `/_img/${slug}-${hash}-${width}.${ext}`;
}

export function validateAlt(alt: unknown, path: string): string {
  if (typeof alt !== "string") {
    throw new SsgError(`image("${path}") exige "alt" (use alt: "" para imagem decorativa)`);
  }
  return alt;
}

const srcset = (vs: Variant[]) => vs.map((v) => `${v.url} ${v.width}w`).join(", ");

export function buildDescriptor(entry: ManifestEntry, alt: string): ImageDescriptor {
  const base = { alt, width: entry.width, height: entry.height };
  if (entry.kind === "passthrough") {
    return { ...base, src: entry.url ?? "", sources: [], fallbackSrcset: "" };
  }
  const { avif, webp, fallback } = entry.variants;
  const closest = fallback.reduce<Variant | undefined>(
    (best, v) => (best === undefined || Math.abs(v.width - 960) < Math.abs(best.width - 960) ? v : best),
    undefined,
  );
  const sources = [
    { type: "image/avif", srcset: srcset(avif) },
    { type: "image/webp", srcset: srcset(webp) },
  ].filter((s) => s.srcset !== "");
  return { ...base, src: closest?.url ?? "", sources, fallbackSrcset: srcset(fallback) };
}

export function pictureModel(
  img: ImageDescriptor,
  opts: PictureOptions = {},
): { sources: { type: string; srcset: string; sizes: string }[]; img: Record<string, string> } {
  const sizes = opts.sizes ?? "100vw";
  const raster = img.fallbackSrcset !== "";
  const attrs: Record<string, string> = { src: img.src };
  if (raster) {
    attrs.srcset = img.fallbackSrcset;
    attrs.sizes = sizes;
  }
  attrs.width = String(img.width);
  attrs.height = String(img.height);
  attrs.alt = img.alt;
  if (opts.class) attrs.class = opts.class;
  attrs.decoding = "async";
  if (opts.priority) {
    attrs.loading = "eager";
    attrs.fetchpriority = "high";
  } else {
    attrs.loading = "lazy";
  }
  return { sources: img.sources.map((s) => ({ ...s, sizes })), img: attrs };
}
