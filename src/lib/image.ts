import { SsgError } from "./errors";
import {
  buildDescriptor,
  type ImageDescriptor,
  type ImageManifest,
  type OgImage,
  ogToken,
  type PictureOptions,
  pictureModel,
  validateAlt,
} from "./image-core";
import { view } from "./renderer";
import { absoluteUrl } from "./routes-core";

let manifest: ImageManifest | null = null;
let ogRequests = new Set<string>();

export function setImageManifest(m: ImageManifest | null): void {
  manifest = m;
}

// Só no build: o manifesto não existe no browser
export function image(path: string, opts: { alt: string }): ImageDescriptor {
  if (!manifest) throw new Error("image() só pode ser chamado durante o build");
  // Chaves do manifesto são NFC; o nome digitado pode vir em NFD (macOS)
  const entry = manifest.get(path.normalize("NFC"));
  if (!entry) {
    throw new SsgError(`image("${path}"): imagem não encontrada em src/assets/images/`);
  }
  return buildDescriptor(entry, validateAlt(opts?.alt, path));
}

export function Picture(img: ImageDescriptor, opts?: PictureOptions): unknown {
  const m = pictureModel(img, opts);
  if (m.sources.length === 0) return view`<img ...${m.img} />`;
  return view`<picture>${m.sources.map((s) => view`<source ...${s} />`)}<img ...${m.img} /></picture>`;
}

// URL absoluta fica como está; "/x" é arquivo de public/; o resto é path do manifesto
export function resolveOgImage(image: string | undefined, baseUrl: string): OgImage | undefined {
  if (!image) return undefined;
  if (/^https?:\/\//i.test(image)) return { url: image };
  if (image.startsWith("/")) return { url: absoluteUrl(baseUrl, image) };
  const key = image.normalize("NFC");
  const entry = manifest?.get(key);
  if (!entry) throw new SsgError(`head.image "${image}": imagem não encontrada em src/assets/images/`);
  // SVG/GIF não têm variação og: usa o arquivo original e não gera nada
  if (entry.kind === "passthrough") return { url: absoluteUrl(baseUrl, entry.url ?? "") };
  ogRequests.add(key);
  return {
    url: absoluteUrl(baseUrl, entry.ogUrl ?? ""),
    width: ogToken(entry.ogUrl ?? "", "width"),
    height: ogToken(entry.ogUrl ?? "", "height"),
    type: "image/jpeg",
  };
}

export function takeOgRequests(): string[] {
  const out = [...ogRequests];
  ogRequests = new Set();
  return out;
}
