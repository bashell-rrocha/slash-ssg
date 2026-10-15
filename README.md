# slash-ssg

> **Projeto criado pelo "Use this template"?** Rode `bun run standalone` (ou `bun run standalone --without-ui`)
> **antes** do `bun install`: o `workspace:*` do `slash-ui` só instala dentro do monorepo. Ver
> [Criar um projeto derivado](#criar-um-projeto-derivado).

Template de site estático com [Slash](../slash): uma página HTML por URL, imagens otimizadas
(AVIF/WebP/JPEG responsivos), CSS Modules e ilhas interativas hidratadas só onde necessário.
O build gera tudo em `dist/`, pronto para qualquer hospedagem estática.

## Scripts

| Comando | O que faz |
| --- | --- |
| `bun run dev` | Build em modo dev + servidor com live reload (observa `src/` e `public/`) |
| `bun run build` | Build de produção em `dist/` (nomes com hash, JS/CSS minificados) |
| `bun run build:prod` | Portão de conteúdo e, se ele abrir, o build (use no deploy) |
| `bun run gate` | Portão de conteúdo: lista fictícios, placeholders e pendências (ver [Conteúdo](#conteúdo)) |
| `bun run preview` | Serve o `dist/` já gerado |
| `bun run test` | Testes unitários e de build (`bun test src/ scripts/ examples/`) |
| `bun run test:e2e` | Testes de ponta a ponta com Playwright (faz o build e sobe o preview sozinho) |
| `bun run test:all` | Tudo de uma vez: `bun run test` seguido de `bun run test:e2e` |
| `bun run standalone` | Prepara um projeto criado do template para rodar fora do monorepo (ver [Criar um projeto derivado](#criar-um-projeto-derivado)) |

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
src/components/   peças de layout reaproveitadas pelas páginas
src/islands/      componentes interativos
src/data/         conteúdo (só pages, routes.ts e scripts importam valores daqui) e o portão de conteúdo
src/tokens.module.css  única fonte de cor (var(--…) no resto)
src/assets/images imagens processadas pelo pipeline
src/lib/          núcleo do template (head, imagens, ilhas, prerender)
scripts/          build, dev, preview, content-gate
src/architecture.test.ts  regras de arquitetura (ver abaixo)
```

## Arquitetura

`src/architecture.test.ts` roda com `bun run test` e falha quando o código sai das regras: cada camada só importa o que
a matriz permite (`components/`, `pages/`, `islands/` e, se você criar, `atoms/`, `molecules/`, `organisms/`,
`templates/` dentro de `components/`); só `pages/`, `routes.ts`, `scripts/` e `data/` importam valores de `src/data`;
nenhuma cor literal (hex, funções de cor como `rgb()`/`oklch()` e cores nomeadas como `white`) fora de
`src/tokens.module.css` e `src/styles/themes/*.css`; `unsafeHtml` só nos arquivos listados; nada de `any`,
`@ts-ignore`, `@ts-nocheck` ou `@ts-expect-error` sem justificativa; testes no padrão AAA (`// Arrange`, `// Act`,
`// Assert`); nenhum `@keyframes` em CSS module; todo arquivo de `src/data/` registrado em `allContent`.

As constantes no topo do arquivo adaptam as regras ao projeto: `LAYERS` e `ALLOWED_IMPORTS` (camadas e matriz),
`SHARED` (o que qualquer camada importa), `DATA` e `DATA_INFRA`, `COLOR_FILES` e `THEME_FILE`, `UNSAFE_HTML_ALLOWED`
e `LEGACY` (arquivos isentos das regras de camada, dados, cor e AAA; a lista só diminui).

Ficam de fora: `src/lib/` e `scripts/ssg/` (o framework, com testes próprios), `tests/e2e/` e imports que não são
relativos (pacotes e aliases de `paths`): use caminhos relativos dentro de `src/` para as regras valerem.

## Conteúdo

`bun run gate` percorre `allContent` (`src/data/index.ts`; registre ali cada arquivo de dados novo) e aponta:

- **fictitious**: registro com `fictitious: true` (exemplo, depoimento inventado, cliente de mentira);
- **placeholder**: texto com `[...]`, como `[E-MAIL]` (link markdown `[texto](url)` não conta);
- **pending**: registro com `pending: ["o que falta confirmar"]`.

Placeholder e pending sempre fecham o portão. Fictício só passa com `content-release.json` cujo `digest` é o que o
`gate` imprime: quem libera assina `approvedBy`, `approvedAt` (AAAA-MM-DD) e `note`. Qualquer fictício novo ou
alterado muda o digest e fecha o portão de novo. O `content-release.json` do template libera só os dois posts de
exemplo; enquanto o arquivo existir, `bun run test` confere que ele ainda libera o conteúdo atual.

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

## Testes no GitHub

`.github/workflows/test.yml` roda em todo PR para `develop` ou `main` e no push na `main`, como um projeto criado do
template (fora do monorepo): o job `framework` com `bun run standalone --without-ui`, e o job `slash-ui` com o exemplo
do kit (o token precisa ler o pacote privado `@bashell-rrocha/slash-ui`: dê acesso a este repositório em *Package
settings → Manage Actions access*, ou crie o segredo `SLASH_UI_TOKEN`). Merge só com os dois verdes.

## Deploy

- Comando de build: `bun run build`
- Diretório de saída: `dist`
- `public/_headers` (Cloudflare Pages e Netlify) dá cache imutável de um ano a `/_img/*`, `/client-*.js` e
  `/styles-*.css`, que têm hash no nome.

## Criar um projeto derivado

O repositório é um template do GitHub ("Use this template"), e o projeto novo roda fora do monorepo `slash-meta`:
o core vem do npm (`@_bashell/slash`), e o exemplo `examples/slash-ui` usa o kit `slash-ui`, que é privado.

1. Crie o repositório pelo template (ou copie a pasta sem `.git/`, `node_modules/`, `dist/` e `.slash-cache/`).
2. Antes do `bun install`, prepare as dependências do kit (`bun run standalone` roda sem nada instalado):
   - com o `slash-ui` (precisa de acesso ao pacote privado `@bashell-rrocha/slash-ui` no GitHub Packages):
     `bun run standalone && GITHUB_TOKEN=$(gh auth token) bun install`. O comando troca o `workspace:*` pelo pacote
     e põe o escopo no `bunfig.toml` (o token vem do ambiente, nunca de arquivo);
   - sem o `slash-ui`: `bun run standalone --without-ui && bun install`. Tira o pacote, o `examples/slash-ui` e os
     scripts `ui:*` (lista o que apaga; recusa, sem gravar nada, se `examples/slash-ui` tiver mudanças no git). O
     `examples/` só sai do script `test` (e do disco) se não sobrar outro exemplo.
   - se o `bunfig.toml` já define os escopos em linha (`scopes = { ... }`), o comando não mexe nele e pede para
     acrescentar o escopo `@bashell-rrocha` à mão; opção desconhecida encerra com o uso.
3. Ajuste `src/site.ts`, `src/routes.ts` e rode `bun run dev`. A demo de `src/` pode ser trocada à vontade: o teste do
   framework usa a própria cópia (`scripts/ssg/__fixtures__/site/`).
4. **Apague `content-release.json`** e troque os posts de exemplo por conteúdo real; no deploy use
   `bun run build:prod`, que não publica conteúdo fictício sem liberação.
5. Para os testes E2E, instale o navegador do Playwright uma vez: `bunx playwright install chromium`.
