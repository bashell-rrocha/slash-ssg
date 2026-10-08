import { h, html } from "@_bashell/slash/core";
import { htmlString } from "@_bashell/slash/ssr";

// __SERVER__ é definido pelo bundler (true no prerender, false no client): a condição é constante e o
// bundler elimina o ramo morto, então o client não carrega o renderer de string (htmlString). Fora de
// bundler (testes unitários) cai na detecção por document. A condição fica inline nos dois exports:
// o Bun só elimina o import quando a constante aparece direto no ternário.
// Componentes de ilha rodam nos dois ambientes: html no browser, htmlString no build
// biome-ignore lint/suspicious/noExplicitAny: o resultado é string no build e Node no browser; as páginas o tratam como string
export const view: (strings: TemplateStringsArray, ...values: unknown[]) => any = (
  typeof __SERVER__ === "undefined"
    ? typeof document === "undefined"
    : __SERVER__
)
  ? htmlString
  : html;

// Ilhas com estado local: no browser, a view roda como componente reativo (re-renderiza
// quando o estado muda, sem recriá-lo); no build, é só chamada uma vez
// biome-ignore lint/suspicious/noExplicitAny: mesmo motivo de view (string no build, Node no browser)
export const reactiveView: (fn: () => unknown) => any = (
  typeof __SERVER__ === "undefined"
    ? typeof document === "undefined"
    : __SERVER__
)
  ? (fn) => fn()
  : (fn) => h(fn as () => Node, null);
