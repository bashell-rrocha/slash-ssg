import { isSafeHtml, type SafeHtml, unsafeHtml } from "@_bashell/slash/ssr";
import { escapeHtml } from "./escape";
import { islandWrapper, serializeProps } from "./island-core";

// Mesmas regras dos filhos de um template: SafeHtml entra como está, arrays são juntados, vazio some e o resto é texto escapado
// `true` vira texto ("true"), como no childToString do core
function innerToHtml(value: unknown): string {
  if (isSafeHtml(value)) return value.value;
  if (Array.isArray(value)) return value.map(innerToHtml).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(String(value));
}

// Renderiza a ilha no build: HTML inicial dentro do wrapper com as props serializadas
export function island<P>(name: string, Component: (props: P) => unknown, props: P): SafeHtml {
  const propsJson = serializeProps(name, props);
  const inner = Component(props);
  // unsafeHtml: o wrapper é montado por islandWrapper (nome e props escapados) em volta do HTML da ilha,
  // que só entra cru se já for SafeHtml (veja innerToHtml)
  return unsafeHtml(islandWrapper(name, propsJson, innerToHtml(inner)));
}
