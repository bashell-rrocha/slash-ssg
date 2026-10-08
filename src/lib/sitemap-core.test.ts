import { describe, expect, test } from "bun:test";
import { renderRobots, renderSitemap } from "./sitemap-core";

describe("sitemap-core", () => {
  test("inclui só indexáveis, na ordem recebida", () => {
    const xml = renderSitemap("https://ex.com", [
      { url: "/", indexable: true },
      { url: "/404", indexable: false },
      { url: "/sobre/", indexable: true },
    ]);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).not.toContain("404");
    expect(xml.indexOf("<loc>https://ex.com/</loc>")).toBeLessThan(xml.indexOf("<loc>https://ex.com/sobre/</loc>"));
  });

  test("URLs absolutas sem barra dupla com baseUrl terminado em /", () => {
    const xml = renderSitemap("https://ex.com/", [{ url: "/sobre/", indexable: true }]);
    expect(xml).toContain("<loc>https://ex.com/sobre/</loc>");
    // "https://" tem barra dupla legítima; qualquer outra barra dupla na URL é erro
    expect(xml).not.toMatch(/https:\/\/[^/<]+\/\//);
  });

  test("escapa & na URL", () => {
    const xml = renderSitemap("https://ex.com", [{ url: "/a?x=1&y=2", indexable: true }]);
    expect(xml).toContain("<loc>https://ex.com/a?x=1&amp;y=2</loc>");
  });
});

describe("renderRobots", () => {
  test("permite tudo e aponta para o sitemap absoluto, tolerando barra final no baseUrl", () => {
    const expected = "User-agent: *\nAllow: /\n\nSitemap: https://ex.com/sitemap.xml\n";
    expect(renderRobots("https://ex.com")).toBe(expected);
    expect(renderRobots("https://ex.com/")).toBe(expected);
  });
});
