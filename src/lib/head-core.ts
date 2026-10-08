import { isSafeHtml } from "@_bashell/slash/ssr";
import { escapeHtml as e } from "./escape";
import type { OgImage } from "./image-core";
import { absoluteUrl } from "./routes-core";
import type { Head, SiteConfig } from "./types";

export function resolveTitle(title: string, siteName: string): string {
  return title === siteName ? title : `${title} | ${siteName}`;
}

export function renderHead(input: {
  head: Head;
  site: SiteConfig;
  url: string;
  ogImage?: OgImage; // já resolvido (url absoluta)
  cssHrefs: string[];
  devReload: boolean;
}): string {
  const { head, site, url, ogImage, cssHrefs, devReload } = input;
  const title = resolveTitle(head.title, site.name);
  const description = head.description ?? site.defaultHead?.description;
  const canonical = head.canonical ?? absoluteUrl(site.baseUrl, url);
  const out: string[] = [`<title>${e(title)}</title>`];

  if (description) out.push(`<meta name="description" content="${e(description)}">`);
  // Páginas noindex não declaram canonical nem og:url (sinais contraditórios para buscadores)
  if (!head.noindex) out.push(`<link rel="canonical" href="${e(canonical)}">`);
  if (head.noindex) out.push('<meta name="robots" content="noindex">');

  out.push(`<meta property="og:title" content="${e(title)}">`);
  if (description) out.push(`<meta property="og:description" content="${e(description)}">`);
  if (!head.noindex) out.push(`<meta property="og:url" content="${e(canonical)}">`);
  out.push(`<meta property="og:site_name" content="${e(site.name)}">`);
  out.push('<meta property="og:type" content="website">');
  if (ogImage) {
    out.push(`<meta property="og:image" content="${e(ogImage.url)}">`);
    if (ogImage.width) out.push(`<meta property="og:image:width" content="${ogImage.width}">`);
    if (ogImage.height) out.push(`<meta property="og:image:height" content="${ogImage.height}">`);
    if (ogImage.type) out.push(`<meta property="og:image:type" content="${e(ogImage.type)}">`);
    if (head.imageAlt !== undefined) out.push(`<meta property="og:image:alt" content="${e(head.imageAlt)}">`);
  }
  out.push(`<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">`);
  if (ogImage && head.imageAlt !== undefined) {
    out.push(`<meta name="twitter:image:alt" content="${e(head.imageAlt)}">`);
  }

  if (head.jsonLd) {
    const items = Array.isArray(head.jsonLd) ? head.jsonLd : [head.jsonLd];
    for (const item of items) {
      // "<" escapado para que o JSON não feche o <script>
      const json = JSON.stringify(item).replace(/</g, "\\u003c");
      out.push(`<script type="application/ld+json">${json}</script>`);
    }
  }

  if (head.extra) out.push(isSafeHtml(head.extra) ? head.extra.value : e(String(head.extra)));
  for (const href of cssHrefs) out.push(`<link rel="stylesheet" href="${e(href)}">`);
  if (devReload) {
    out.push('<script>new EventSource("/__reload").onmessage=()=>location.reload()</script>');
  }
  return out.join("\n");
}
