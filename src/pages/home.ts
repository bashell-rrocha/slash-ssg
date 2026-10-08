import { layout } from "../components/layout";
import { posts } from "../data/posts";
import { Counter } from "../islands/counter";
import { Gallery } from "../islands/gallery";
import { image, Picture } from "../lib/image";
import { island } from "../lib/island";
import { view } from "../lib/renderer";
import styles from "../styles.module.css";

export function home(): string {
  const hero = image("hero.jpg", { alt: "Paisagem de exemplo" });
  const images = [image("gallery/one.png", { alt: "Primeira" }), image("gallery/two.png", { alt: "Segunda" })];
  return layout(view`
    <h1>Slash SSG</h1>
    <p>Site estático gerado com Slash: HTML por URL, imagens otimizadas e ilhas interativas.</p>
    <div class=${styles.hero}>${Picture(hero, { priority: true, sizes: "100vw" })}</div>
    <h2>Ilhas</h2>
    ${island("counter", Counter, { start: 3 })}
    ${island("gallery", Gallery, { images })}
    <h2>Posts</h2>
    <ul>${posts.map((p) => view`<li><a href=${`/posts/${p.slug}/`}>${p.title}</a></li>`)}</ul>
  `);
}
