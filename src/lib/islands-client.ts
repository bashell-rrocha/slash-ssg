import { render } from "@_bashell/slash/core";
import { parseIslandProps } from "./island-core";

// "never" nos parâmetros aceita componentes com props tipadas de forma diferente
export type IslandRegistry = Record<string, (props: never) => unknown>;

// Monta cada [data-island] do zero: limpa o HTML do servidor e renderiza o componente.
// Uma ilha com falha mantém o HTML do servidor e não impede a montagem das demais.
export function mountIslands(registry: IslandRegistry, root: ParentNode = document): void {
  for (const el of root.querySelectorAll("[data-island]")) {
    const name = el.getAttribute("data-island") ?? "";
    const Component = registry[name];
    if (!Component) {
      if (__DEV__) console.warn(`[slash-ssg] ilha não registrada: ${name}`);
      continue;
    }
    let saved: Node[] | null = null;
    try {
      const props = parseIslandProps(el.getAttribute("data-props") ?? undefined);
      saved = Array.from(el.childNodes);
      el.replaceChildren();
      render(() => (Component as (p: unknown) => unknown)(props) as Node, el as HTMLElement);
    } catch (err) {
      // Restaura o HTML do servidor para a ilha não ficar em branco
      if (saved) el.replaceChildren(...saved);
      console.error(`[slash-ssg] falha ao montar ilha ${name}`, err);
    }
  }
}
