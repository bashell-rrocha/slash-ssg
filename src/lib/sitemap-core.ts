import { escapeHtml } from "./escape";
import { absoluteUrl } from "./routes-core";

export function renderSitemap(baseUrl: string, pages: { url: string; indexable: boolean }[]): string {
  const entries = pages
    .filter((p) => p.indexable)
    .map((p) => `  <url><loc>${escapeHtml(absoluteUrl(baseUrl, p.url))}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
}

// robots.txt padrão (usado quando public/robots.txt não existe)
export function renderRobots(baseUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(baseUrl, "/sitemap.xml")}\n`;
}
