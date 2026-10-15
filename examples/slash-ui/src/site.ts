import type { SiteConfig } from "../../../src/lib/types";

// Site de exemplo do slash-ui (as mesmas telas em slash-ssg, slash-spa e slash-ssr): só para teste, fora dos buscadores.
export const site: SiteConfig = {
  name: "slash-ui: site de exemplo",
  baseUrl: "http://localhost",
  lang: "pt-BR",
  defaultHead: { description: "As telas do slash-ui montadas no slash-ssg." },
};
