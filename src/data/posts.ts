export interface Post {
  /** Conteúdo de exemplo: o portão de conteúdo só deixa publicar com liberação em content-release.json. */
  fictitious?: true;
  slug: string;
  title: string;
  summary: string;
  body: string;
}

export const posts: Post[] = [
  {
    fictitious: true,
    slug: "primeiro-post",
    title: "Primeiro post",
    summary: "Como começar com o slash-ssg.",
    body: "Cada arquivo de página retorna HTML seguro, e o build grava um index.html por URL.",
  },
  {
    fictitious: true,
    slug: "segundo-post",
    title: "Segundo post",
    summary: "Ilhas e imagens.",
    body: "Só o que precisa de interação vira ilha; o resto da página continua HTML estático.",
  },
];
