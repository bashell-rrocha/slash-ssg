import type { SafeHtml } from "@_bashell/slash/ssr";
import { layout } from "../components/layout";
import { view } from "../lib/renderer";

export function notFound(): SafeHtml {
  return layout(view`
    <h1>Página não encontrada</h1>
    <p><a href="/">Voltar ao início</a></p>
  `);
}
