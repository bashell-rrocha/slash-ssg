import type { SafeHtml } from "@_bashell/slash/ssr";
import { layout } from "../components/layout";
import { posts } from "../data/posts";
import { view } from "../lib/renderer";

export function post({ slug }: { slug: string }): SafeHtml {
  const found = posts.find((p) => p.slug === slug);
  if (!found) throw new Error(`post "${slug}" não encontrado`);
  return layout(view`
    <article>
      <h1>${found.title}</h1>
      <p>${found.body}</p>
    </article>
  `);
}
