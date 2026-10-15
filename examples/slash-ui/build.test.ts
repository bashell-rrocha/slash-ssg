import { exampleSite } from "@_bashell/slash-ui/host";
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Hospedeiro de exemplo do slash-ui no slash-ssg: o build gera uma página por rota do site de exemplo, com o tema da
// página no <html>, o CSS distribuível dos temas com as fontes, e o PWA do app (manifest, service worker, ícones).

const ROOT = import.meta.dir;
const DIST = join(ROOT, "dist");

describe("ui:build (slash-ssg)", async () => {
  const proc = Bun.spawn(["bun", "run", join(ROOT, "build.ts")], {
    cwd: join(ROOT, "..", ".."),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  const page = (path: string) => readFileSync(join(DIST, path, "index.html"), "utf8");

  test("o build termina sem erro", () => {
    expect([code, stderr.includes("error")]).toEqual([0, false]);
  });

  test("uma página por rota do site, com o tema e o modo dela no <html>", () => {
    // Arrange
    const pages = exampleSite();

    // Act
    const htmls = pages.map((p) => [p.path, /<html[^>]*>/.exec(page(p.path))?.[0]]);

    // Assert
    expect(htmls).toEqual(
      pages.map((p) => [p.path, `<html lang="pt-BR" data-theme="${p.theme}" data-mode="${p.mode}">`]),
    );
    expect(page("")).toContain("slash-ui: site de exemplo");
  });

  test("head igual ao dos outros hospedeiros: título exato e viewport com a área segura", () => {
    // Arrange / Act
    const app = page("app/hoje");

    // Assert
    expect(app).toContain("<title>Hoje · Sereno</title>");
    expect(app).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/);
  });

  test("CSS dos temas com as fontes ao lado, e o PWA do app", () => {
    // Arrange
    const fonts = readdirSync(join(DIST, "themes/brisa/fonts"));

    // Act
    const manifest = JSON.parse(readFileSync(join(DIST, "app/manifest.webmanifest"), "utf8")) as { scope: string };
    const sw = readFileSync(join(DIST, "app/sw.js"), "utf8");

    // Assert
    expect(existsSync(join(DIST, "themes/dist/base.css"))).toBe(true);
    expect(fonts.some((f) => f.endsWith(".woff2"))).toBe(true);
    expect(manifest.scope).toBe("/app/");
    expect(sw).toContain('"/app/hoje/"');
    expect(sw).toMatch(/"\/client-[\w-]+\.js"/);
    expect(existsSync(join(DIST, "app/icons/icon-512.png"))).toBe(true);
  });

  test("app com o manifest e a ilha que registra o service worker; landing com a ilha do topo flutuante", () => {
    // Arrange / Act
    const [app, landing] = [page("app/hoje"), page("landing/sereno")];

    // Assert
    expect(app).toContain('<link rel="manifest" href="/app/manifest.webmanifest">');
    expect(app).toContain('data-island="pwa"');
    expect(app).toMatch(/<script type="module" src="\/client-[\w-]+\.js"><\/script>/);
    expect(landing).toContain('data-island="floating-nav"');
    expect(app).toMatch(/<body>\s*<div id="app"><div class="[^"]*" data-shell="app">/);
    expect(landing).not.toContain("manifest");
  });
});
