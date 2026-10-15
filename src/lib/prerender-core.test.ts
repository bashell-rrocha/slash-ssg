import { unsafeHtml } from "@_bashell/slash/ssr";
import { describe, expect, test } from "bun:test";
import { renderRoutes } from "./prerender-core";
import type { Route, SiteConfig } from "./types";

const site: SiteConfig = { name: "S", baseUrl: "https://ex.com", lang: "pt-BR" };
const shell = "<!doctype html><html><head><!--slash:head--></head><body><!--slash:app--></body></html>";
const input = { manifest: [], shell, cssHrefs: ["/styles.css"], scriptSrc: "/client.js", devReload: false };

describe("renderRoutes", () => {
  test("renderiza as rotas recebidas, com os atributos do <html> de cada página", async () => {
    // Arrange
    const routes: Route[] = [
      {
        path: "/app/hoje",
        head: { title: "Hoje", htmlAttrs: { "data-theme": "brisa", "data-mode": "light" } },
        page: () => unsafeHtml("<main>oi</main>"),
      },
      { path: "/404", head: { title: "404", noindex: true }, page: () => unsafeHtml("<main>404</main>") },
    ];

    // Act
    const { pages } = await renderRoutes(routes, site, input);

    // Assert
    expect(pages.map((p) => [p.url, p.file])).toEqual([
      ["/app/hoje/", "app/hoje/index.html"],
      ["/404", "404.html"],
    ]);
    expect(pages[0]?.html).toContain('<html lang="pt-BR" data-theme="brisa" data-mode="light">');
    expect(pages[0]?.html).toContain("<main>oi</main>");
  });

  test("erro numa rota diz qual", async () => {
    // Arrange
    const routes: Route[] = [{ path: "/x", head: { title: "X" }, page: () => "texto" as never }];

    // Act
    const run = renderRoutes(routes, site, input);

    // Assert
    await expect(run).rejects.toThrow("Erro ao renderizar /x");
  });
});
