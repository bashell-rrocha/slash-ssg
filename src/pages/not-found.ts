import { layout } from "../components/layout";
import { view } from "../lib/renderer";

export function notFound(): string {
  return layout(view`
    <h1>Página não encontrada</h1>
    <p><a href="/">Voltar ao início</a></p>
  `);
}
