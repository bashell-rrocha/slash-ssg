import { routes } from "../routes";
import { site } from "../site";
import { type PrerenderInput, type RenderedPage, renderRoutes } from "./prerender-core";

export type { PrerenderInput, RenderedPage } from "./prerender-core";

// Entrada do bundle do servidor: renderiza todas as rotas do site em memória
export function prerender(input: PrerenderInput): Promise<{ pages: RenderedPage[]; ogRequests: string[] }> {
  return renderRoutes(routes, site, input);
}
