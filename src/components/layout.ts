import type { SafeHtml } from "@_bashell/slash/ssr";
import { view } from "../lib/renderer";
import { site } from "../site";
import styles from "../styles.module.css";

// Casca comum das páginas: navegação, conteúdo e rodapé
export function layout(content: unknown): SafeHtml {
  return view`<div class=${styles.page}>
    <nav class=${styles.nav}>
      <a href="/">Início</a>
      <a href="/sobre/">Sobre</a>
      <a href="/posts/primeiro-post/">Posts</a>
    </nav>
    <main class=${styles.main}>${content}</main>
    <footer class=${styles.footer}>${site.name}</footer>
  </div>`;
}
