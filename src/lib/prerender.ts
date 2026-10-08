import { routes } from "../routes";
import { site } from "../site";
import { SsgError } from "./errors";
import { renderHead } from "./head-core";
import { resolveOgImage, setImageManifest, takeOgRequests } from "./image";
import type { ManifestEntry } from "./image-core";
import { assertShell, renderDocument } from "./render-page";
import { expandRoutes } from "./routes-core";
import type { Head } from "./types";

const describe = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

export interface PrerenderInput {
  manifest: [string, ManifestEntry][];
  shell: string;
  cssHrefs: string[];
  scriptSrc: string | null;
  devReload: boolean;
}

export interface RenderedPage {
  url: string;
  file: string;
  html: string;
  indexable: boolean;
}

// Entrada do bundle do servidor: renderiza todas as rotas em memória
export async function prerender(input: PrerenderInput): Promise<{ pages: RenderedPage[]; ogRequests: string[] }> {
  assertShell(input.shell);
  setImageManifest(new Map(input.manifest));
  takeOgRequests();

  try {
    const expanded = await expandRoutes(routes);
    if (!expanded.some((r) => r.url === "/404")) {
      console.warn("Aviso: nenhuma rota /404 definida; o host usará a página de erro padrão");
    }

    const pages: RenderedPage[] = [];
    for (const { route, params, url, file } of expanded) {
      try {
        const head: Head | undefined = typeof route.head === "function" ? await route.head(params) : route.head;
        if (typeof head !== "object" || head === null) {
          throw new SsgError(`head deve resolver para um objeto com title (recebido: ${describe(head)})`);
        }
        const body: unknown = await route.page(params);
        if (typeof body !== "string") {
          throw new SsgError(`page deve retornar uma string de HTML (recebido: ${describe(body)})`);
        }
        const ogImage = resolveOgImage(head.image ?? site.defaultHead?.image, site.baseUrl);
        const headHtml = renderHead({
          head,
          site,
          url,
          ogImage,
          cssHrefs: input.cssHrefs,
          devReload: input.devReload,
        });
        const html = renderDocument({
          shell: input.shell,
          head: headHtml,
          body,
          scriptSrc: input.scriptSrc,
          lang: site.lang,
        });
        pages.push({ url, file, html, indexable: !head.noindex && url !== "/404" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new SsgError(`Erro ao renderizar ${url}: ${message}`, { cause: err });
      }
    }
    return { pages, ogRequests: takeOgRequests() };
  } finally {
    setImageManifest(null);
  }
}
