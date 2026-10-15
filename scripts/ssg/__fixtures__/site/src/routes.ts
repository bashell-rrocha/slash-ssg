import { posts } from "./data/posts";
import type { Route } from "./lib/types";
import { about } from "./pages/about";
import { home } from "./pages/home";
import { notFound } from "./pages/not-found";
import { post } from "./pages/post";

export const routes: Route[] = [
  {
    path: "/",
    head: { title: "Slash SSG", image: "hero.jpg", imageAlt: "Imagem de destaque do Slash SSG" },
    page: home,
  },
  { path: "/sobre", head: { title: "Sobre" }, page: about },
  {
    path: "/posts/:slug",
    paths: () => posts.map((p) => ({ slug: p.slug })),
    head: ({ slug }) => ({
      title: posts.find((p) => p.slug === slug)?.title ?? slug,
      description: posts.find((p) => p.slug === slug)?.summary,
    }),
    page: post as Route["page"],
  },
  { path: "/404", head: { title: "Página não encontrada", noindex: true }, page: notFound },
];
