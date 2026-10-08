import { SsgError } from "./errors";
import type { ExpandedRoute, Params, Route } from "./types";

const PARAM_VALUE = /^[a-z0-9-]+$/;
const PARAM_NAME = /:([A-Za-z0-9_]+)/g;

// Nomes dos params presentes no path ("/posts/:slug" → ["slug"])
function paramNames(path: string): string[] {
  return [...path.matchAll(PARAM_NAME)].map((m) => m[1] as string);
}

// "/" → "/", "/sobre" → "/sobre/", "/404" → "/404"
export function buildUrl(path: string, params: Params): string {
  const filled = path.replace(PARAM_NAME, (_, name: string) => params[name] ?? "");
  if (filled === "/") return "/";
  if (filled === "/404") return "/404";
  return filled.endsWith("/") ? filled : `${filled}/`;
}

// "/" → "index.html", "/sobre/" → "sobre/index.html", "/404" → "404.html"
export function urlToFile(url: string): string {
  if (url === "/") return "index.html";
  if (url.endsWith("/")) return `${url.slice(1)}index.html`;
  return `${url.slice(1)}.html`;
}

// Junta baseUrl e url sem barra dupla
export function absoluteUrl(baseUrl: string, url: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

export async function expandRoutes(routes: Route[]): Promise<ExpandedRoute[]> {
  const result: ExpandedRoute[] = [];
  const seen = new Map<string, string>();

  const add = (route: Route, params: Params) => {
    const url = buildUrl(route.path, params);
    const previous = seen.get(url);
    if (previous !== undefined) {
      throw new SsgError(`URL duplicada "${url}": geradas pelas rotas "${previous}" e "${route.path}"`);
    }
    seen.set(url, route.path);
    result.push({ route, params, url, file: urlToFile(url) });
  };

  for (const route of routes) {
    const names = paramNames(route.path);
    if (names.length === 0) {
      add(route, {});
      continue;
    }
    if (!route.paths) {
      throw new SsgError(
        `Rota dinâmica "${route.path}" sem paths(): defina paths() para listar os valores de ${names.join(", ")}`,
      );
    }
    const list = await route.paths();
    for (const params of list) {
      for (const name of names) {
        const value = params[name];
        if (typeof value !== "string") {
          throw new SsgError(`paths() da rota "${route.path}" retornou um objeto sem o param "${name}"`);
        }
        if (!PARAM_VALUE.test(value)) {
          throw new SsgError(
            `Param "${name}" da rota "${route.path}" com valor inválido "${value}": use apenas [a-z0-9-]+`,
          );
        }
      }
      add(route, params);
    }
  }
  return result;
}
