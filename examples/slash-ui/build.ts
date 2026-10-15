import { EXAMPLE_APP, exampleSite, serviceWorkerSource, webManifest } from "@_bashell/slash-ui/host";
import { copyHostAssets, themeColors } from "@_bashell/slash-ui/host/node";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { buildSite } from "../../scripts/ssg/build-site";

// Build do site de exemplo do slash-ui com o pipeline do slash-ssg: as páginas (buildSite), o CSS dos temas com as
// fontes, os ícones, o manifest e o service worker do app.
// Uso: bun run ui:build   (saída em examples/slash-ui/dist/)

const ROOT = import.meta.dir;
const DIST = join(ROOT, "dist");
const pages = exampleSite();

const summary = await buildSite({ root: ROOT, dev: false });
copyHostAssets(DIST, [...new Set(pages.map((p) => p.theme))]);

const colors = themeColors(EXAMPLE_APP.theme);
const manifest = webManifest({
  name: EXAMPLE_APP.name,
  shortName: EXAMPLE_APP.shortName,
  description: EXAMPLE_APP.description,
  startUrl: EXAMPLE_APP.startUrl,
  scope: EXAMPLE_APP.scope,
  themeColor: colors.theme,
  backgroundColor: colors.background,
  icons: "/app/icons/",
});
writeFileSync(join(DIST, "app", "manifest.webmanifest"), JSON.stringify(manifest, null, 2));

// Pré-cache: as rotas do app e os arquivos que elas carregam (CSS e JS do build, tema do app com as fontes, ícones)
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [`/${relative(DIST, path)}`];
  });
const assets = files(DIST).filter(
  (file) =>
    /^\/(styles|client|chunk)-[\w-]+\.(css|js)$/.test(file) ||
    file === "/themes/dist/base.css" ||
    file === `/themes/dist/${EXAMPLE_APP.theme}.css` ||
    file.startsWith(`/themes/${EXAMPLE_APP.theme}/fonts/`) ||
    file.startsWith("/app/icons/"),
);
const precache = [...pages.filter((p) => p.app).map((p) => p.path), ...assets];
writeFileSync(join(DIST, "app", "sw.js"), serviceWorkerSource({ precache, scope: EXAMPLE_APP.startUrl }));
console.log(`[ui:build] ${summary.pages} páginas, ${precache.length} arquivos no pré-cache do app`);
