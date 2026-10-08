import { isSafeHtml, type SafeHtml, unsafeHtml } from "@_bashell/slash/ssr";
import { escapeHtml } from "./escape";
import { islandWrapper, serializeProps } from "./island-core";

// Renderiza a ilha no build: HTML inicial dentro do wrapper com as props serializadas
export function island<P>(name: string, Component: (props: P) => unknown, props: P): SafeHtml {
  const propsJson = serializeProps(name, props);
  const inner = Component(props);
  // unsafeHtml: o wrapper é montado por islandWrapper (nome e props escapados) em volta do HTML da ilha,
  // que só entra cru se já for SafeHtml; qualquer outro valor é escapado como texto
  return unsafeHtml(islandWrapper(name, propsJson, isSafeHtml(inner) ? inner.value : escapeHtml(String(inner))));
}
