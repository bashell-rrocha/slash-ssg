import { posts } from "./posts";

/** Raiz que o portão de conteúdo (`bun run gate`) percorre; cada arquivo de dados novo acrescenta a sua chave. */
export const allContent: Record<string, unknown> = {
  posts,
};
