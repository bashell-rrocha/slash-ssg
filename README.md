# slash-ssg

Template de site estático com [Slash](../slash): uma página HTML por URL, imagens otimizadas
(AVIF/WebP/JPEG responsivos), CSS Modules e ilhas interativas hidratadas só onde necessário.
O build gera tudo em `dist/`, pronto para qualquer hospedagem estática.

## Scripts

| Comando | O que faz |
| --- | --- |
| `bun run dev` | Build em modo dev + servidor com live reload (observa `src/` e `public/`) |
| `bun run build` | Build de produção em `dist/` (nomes com hash, JS/CSS minificados) |
| `bun run preview` | Serve o `dist/` já gerado |
| `bun run test` | Testes unitários e de build (`bun test src/ scripts/`) |
| `bun run test:e2e` | Testes de ponta a ponta com Playwright (faz o build e sobe o preview sozinho) |
| `bun run test:all` | Tudo de uma vez: `bun run test` seguido de `bun run test:e2e` |

A porta padrão é 4000; mude com `PORT=4100 bun run dev` (vale também para `preview`, `test:e2e` e `test:all`).
`PORT` precisa ser um inteiro entre 1 e 65535; qualquer outro valor encerra o comando com uma mensagem de erro.

O build escreve em um diretório de staging (`dist.tmp-<pid>`) e só no fim troca por `dist/`: se o build falhar,
o `dist/` anterior continua intacto e o `dev` nunca serve um `dist/` vazio ou pela metade. A troca são dois
renames seguidos (o antigo sai, o novo entra), então por um instante `dist/` não existe; nesse intervalo o
servidor do `dev` espera até 500 ms por ele antes de responder 404. Restos de builds interrompidos
(`dist.tmp-*` e `dist.old-*` de processos que já não existem) são removidos no início do build seguinte.

## Estrutura

```
public/           copiado como está para dist/ (index.html é a casca do documento)
src/routes.ts     lista de rotas
src/site.ts       configuração do site
src/pages/        funções que retornam `SafeHtml` (``view`...` ``) de cada página
src/islands/      componentes interativos
src/assets/images imagens processadas pelo pipeline
src/lib/          núcleo do template (head, imagens, ilhas, prerender)
scripts/          build, dev, preview
```

A casca `public/index.html` precisa conter os marcadores `<!--slash:head-->` e `<!--slash:app-->`.
O atributo `lang` do `<html>` vem de `site.lang`.

## Rotas

Em `src/routes.ts`:

```ts
export const routes: Route[] = [
  // Rota estática
  { path: "/sobre", head: { title: "Sobre" }, page: about },

  // Rota dinâmica: `paths` lista os parâmetros de cada página gerada
  {
    path: "/posts/:slug",
    paths: () => posts.map((p) => ({ slug: p.slug })),
    head: ({ slug }) => ({ title: tituloDe(slug) }),
    page: ({ slug }) => post({ slug }),
  },

  // Página de erro do host (fora do sitemap)
  { path: "/404", head: { title: "Não encontrada", noindex: true }, page: notFound },
];
```

Cada rota gera `dist/<path>/index.html`; `/404` gera `dist/404.html`.

## Head

Campos de `head`: `title` (recebe o sufixo ` | site.name`), `description`, `image` (og:image: arquivo em
`src/assets/images/`, caminho de `public/` ou URL absoluta), `imageAlt`, `canonical`, `noindex`, `jsonLd`
(objeto ou array) e `extra` (HTML no `<head>`; precisa ser `unsafeHtml("...")`, texto comum é escapado). Páginas `noindex` ficam fora do sitemap e sem `canonical`/`og:url`.
`site.defaultHead` define `description` e `image` padrão.

Open Graph de imagem: quando `image` (da página ou de `site.defaultHead`) é uma imagem local raster de
`src/assets/images/`, o build gera uma variação JPEG de até 1200px e emite `og:image`, `og:image:width`,
`og:image:height` (dimensões reais do JPEG gerado, lidas do arquivo) e `og:image:type` (`image/jpeg`). Com `imageAlt`, emite também
`og:image:alt` e `twitter:image:alt`. Imagens de `public/`, URLs absolutas, SVG e GIF só ganham `og:image`
(sem largura, altura e tipo, que o build não conhece).

## HTML seguro

Páginas, layouts e ilhas retornam ``view`...` ``, que produz `SafeHtml`. Tudo o que você interpola (textos, props,
valores de dados) é sempre escapado, então é seguro passar qualquer valor. `SafeHtml` aninhado (outro ``view`...` ``,
`island()`, `Picture()`) entra como está.

```ts
export function sobre() {
  return layout(view`<h1>${titulo}</h1>`);
}
```

- Retornar uma string comum de uma página falha o build com "page deve retornar HTML seguro".
- `unsafeHtml("...")` serve só para HTML confiável (por exemplo, HTML que você mesmo gerou e sanitizou). Nunca passe
  entrada de usuário. `head.extra` também exige `unsafeHtml(...)`; texto comum é escapado.
- `unsafeUrl("...")` é para URLs excepcionais que a política do core bloqueia (esquemas fora de http, https, mailto e tel).
- Um `<` literal dentro de um `<script>` estático no template exige `unsafeHtml` (limitação do htm).

## Ilhas

As páginas geram HTML estático (sem JavaScript); só o que usa `island()` carrega JavaScript:

```ts
${island("counter", Counter, { start: 3 })}
```

Registre o componente em `src/client.ts`. As props precisam ser serializáveis em JSON. No navegador a ilha é
montada do zero (o bundle do client não inclui o renderer de string do servidor: `__SERVER__` é `true` só no
bundle de prerender); se uma ilha falhar, o HTML do servidor é mantido, o erro vai para o console e as demais seguem.

Contrato para ilhas com estado: crie o estado (`createState`) no corpo do componente e coloque a view dentro de
``reactiveView(() => view`...`)``. Sem esse wrapper, o slash reexecuta o corpo do componente a cada mudança e
o estado volta ao valor inicial. Veja `src/islands/counter.ts`.

## Imagens

Coloque arquivos em `src/assets/images/` (jpg, png, webp, avif, svg, gif).

```ts
const hero = image("hero.jpg", { alt: "Paisagem" });
Picture(hero, { priority: true, sizes: "100vw" }); // priority: carrega já (LCP); sizes: dica de largura
```

`image()` devolve um descritor serializável: pode ser passado como prop de uma ilha e renderizado lá com
`Picture(descritor, { sizes })`. Variantes ficam em `dist/_img/` e o cache em `.slash-cache/`.

## site.ts

```ts
export const site: SiteConfig = {
  name: "Slash SSG",
  baseUrl: "https://example.com", // usado em canonical, og:url, sitemap.xml e robots.txt
  lang: "pt-BR",                  // <html lang>
  defaultHead: { description: "..." },
  images: { widths: [480, 960, 1440, 1920], quality: { avif: 50, webp: 75, jpeg: 80 } },
};
```

`sitemap.xml` é sempre gerado; `robots.txt` é gerado a partir de `baseUrl`, a menos que exista `public/robots.txt`.

## Deploy

- Comando de build: `bun run build`
- Diretório de saída: `dist`
- `public/_headers` (Cloudflare Pages e Netlify) dá cache imutável de um ano a `/_img/*`, `/client-*.js` e
  `/styles-*.css`, que têm hash no nome.

## Criar um projeto derivado

1. Copie a pasta sem `.git/`, `docs/`, `node_modules/`, `dist/` e `.slash-cache/`.
2. No `package.json`, troque `@_bashell/slash` de `workspace:*` para a versão do npm (`^0.0.1`).
3. Remova o alias `paths` (para `../slash/src`) do `tsconfig.json`.
4. Ajuste `src/site.ts`, `src/routes.ts` e rode `bun install && bun run dev`.
5. Para os testes E2E, instale o navegador do Playwright uma vez: `bunx playwright install chromium`.
