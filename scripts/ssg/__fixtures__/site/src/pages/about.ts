import type { SafeHtml } from "@_bashell/slash/ssr";
import { layout } from "../components/layout";
import { view } from "../lib/renderer";

export function about(): SafeHtml {
  return layout(view`
    <h1>Sobre</h1>
    <p>Este exemplo mostra rotas estáticas e dinâmicas, ilhas e o pipeline de imagens do slash-ssg.</p>
  `);
}
