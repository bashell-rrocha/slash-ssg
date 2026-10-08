import type { SafeHtml } from "@_bashell/slash/ssr";

export type Params = Record<string, string>;

export interface Head {
  title: string;
  description?: string;
  image?: string; // og:image: caminho em src/assets/images/, caminho em public/ ("/og.png") ou URL absoluta
  imageAlt?: string; // texto alternativo do og:image (og:image:alt e twitter:image:alt)
  canonical?: string; // default: site.baseUrl + url
  noindex?: boolean; // default: false; true também remove do sitemap
  jsonLd?: object | object[];
  extra?: SafeHtml; // HTML adicional no <head>; precisa de unsafeHtml(...) (texto comum é escapado)
}

export interface Route<P extends Params = Params> {
  path: string; // "/", "/sobre", "/projetos/:slug", "/404"
  paths?: () => P[] | Promise<P[]>; // obrigatório se path tem ":param"
  head: Head | ((params: P) => Head | Promise<Head>);
  page: (params: P) => SafeHtml | Promise<SafeHtml>; // retorna HTML seguro (view`...`)
}

export interface ImagesConfig {
  widths?: number[];
  quality?: { avif?: number; webp?: number; jpeg?: number };
}

export interface SiteConfig {
  name: string;
  baseUrl: string;
  lang: string;
  defaultHead?: { description?: string; image?: string };
  images?: ImagesConfig;
}

export interface ExpandedRoute {
  route: Route;
  params: Params;
  url: string;
  file: string;
}
