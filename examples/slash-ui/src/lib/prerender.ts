import { type PrerenderInput, type RenderedPage, renderRoutes } from "../../../../src/lib/prerender-core";
import { routes } from "../routes";
import { site } from "../site";

// Entrada do bundle de prerender do site de exemplo: o pipeline do template com as rotas do slash-ui.
export function prerender(input: PrerenderInput): Promise<{ pages: RenderedPage[]; ogRequests: string[] }> {
  return renderRoutes(routes, site, input);
}
