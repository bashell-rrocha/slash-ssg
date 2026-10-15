import { unsafeHtml } from "@_bashell/slash/ssr";
import { view } from "@_bashell/slash-ui/core";
import { exampleSite, headLinks, htmlAttrs, renderPage, type SitePage, siteIndex } from "@_bashell/slash-ui/host";
import { themeColors } from "@_bashell/slash-ui/host/node";
import { island } from "../../../src/lib/island";
import type { Route } from "../../../src/lib/types";
import { PwaRegister } from "./pwa";

// Uma rota por página do site de exemplo, mais o índice e o 404. O <head> traz o tema da página (CSS distribuível,
// com escopo [data-theme]) e, no app, o manifest; o corpo é a tela montada pelo kit (o topo flutuante como ilha).

const pages = exampleSite();
const APP_THEME = "brisa";
const themeColor = themeColors(APP_THEME).theme;
const asHtml = (result: unknown) => unsafeHtml(String((result as { value?: string }).value ?? ""));

function head(page: Pick<SitePage, "title" | "theme" | "mode" | "app" | "lang">) {
  return {
    // O título da página como está (os outros hospedeiros não acrescentam o nome do site) e o lang dela no <html>
    title: page.title,
    exactTitle: true,
    noindex: true,
    htmlAttrs: htmlAttrs(page as SitePage),
    extra: unsafeHtml(headLinks(page as SitePage, { base: "/", manifest: "/app/manifest.webmanifest", themeColor })),
  };
}

const INDEX = {
  title: "slash-ui: site de exemplo",
  theme: APP_THEME,
  mode: "light" as const,
  app: false,
  lang: "pt-BR",
};

export const routes: Route[] = [
  { path: "/", head: head(INDEX), page: () => asHtml(view`<div id="app">${siteIndex(pages)}</div>`) },
  ...pages.map(
    (page): Route => ({
      path: page.path,
      head: head(page),
      page: () =>
        // <div id="app">: a mesma raiz do spa e do ssr (a comparação entre os hospedeiros olha dentro dela)
        asHtml(
          view`<div id="app">${renderPage(page, { host: { island } })}</div>${page.app ? island("pwa", PwaRegister, {}) : ""}`,
        ),
    }),
  ),
  {
    path: "/404",
    head: head({ ...INDEX, title: "Página não encontrada" }),
    page: () => unsafeHtml("<main><h1>404</h1></main>"),
  },
];
