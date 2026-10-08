> **Documento histórico** — o contrato atual está no README.

# slash-ssg — Design

**Data:** 2026-10-07
**Status:** aprovado em conversa, aguardando revisão do spec escrito

## Objetivo

Criar um terceiro template do Slash, `slash-ssg`, para sites **estáticos multipágina** gerados no build (SSG). Ele completa a família:

| Template    | Uso                                                        |
|-------------|------------------------------------------------------------|
| `slash-spa` | apps que rodam só no client                                |
| `slash-ssr` | apps dinâmicos que precisam de servidor renderizando por request |
| `slash-ssg` | sites estáticos (institucional, landing, portfólio, blog) com SEO |

O primeiro consumidor é a landing page da agência Bashell (`/home/dev/Projetos/bashell-landing-page`), que terá Vendas, Projetos, Página do projeto (`/projetos/:slug`) e Sobre.

### Critérios de sucesso

- `bun run build` gera `dist/` com um `index.html` por URL, cada um com `<title>`, description, canonical e Open Graph próprios, mais `sitemap.xml` e `404.html`.
- O HTML gerado funciona sem JavaScript. Só páginas com ilhas carregam JS.
- `dist/` pode ser publicado como está em qualquer host estático (Cloudflare Pages, Netlify, Vercel).
- `bun run dev` serve o site com rebuild e live reload ao salvar.
- Imagens em `src/assets/images/` saem em AVIF, WebP e fallback, em várias larguras, com `srcset`, `width`/`height` e lazy loading automáticos.
- Testes unitários e E2E passam no exemplo incluído.

## Decisões e consistência com o Slash

- **Core sem mudanças.** No Slash, o core (`@_bashell/slash`) guarda as primitivas (`./core`, `./ssr`, `./router`, `./forms`) e os templates guardam a orquestração (scripts de dev e build, servidor, plugins). O `slash-ssg` segue esse padrão: toda a lógica de SSG fica no template. Ele usa `htmlString` (de `@_bashell/slash/ssr`) no build e `render` (de `@_bashell/slash/core`) no browser. Se faltar alguma primitiva durante a implementação, isso vira uma decisão separada, levada ao autor antes de mexer no core.
- **Rotas por tabela explícita** (`src/routes.ts`), sem roteamento por arquivo.
- **Estilos com CSS Modules** e `plugins/css-types.ts`, como nos outros templates. Sem Tailwind.
- **Ilhas são montadas do zero** no browser (sem hidratação no lugar). A hidratação atual do core é por app inteira, e hidratar por ilha exigiria mexer no core.
- **Pipeline de imagens no template**, com `sharp` como única dependência nova de runtime do build.
- **Repositório:** `packages/slash-ssg` tem `.git` próprio, como `slash-ssr` e `slash-spa`. O `slash-meta` continua sem git.
- **Dependência:** dentro do monorepo, `@_bashell/slash: workspace:*`. Projetos derivados (copiados sem `.git/` e `docs/`) trocam para `@_bashell/slash@^0.3.0` do npm.

## Estrutura

```
packages/slash-ssg/
├── package.json          # private; scripts dev, build, preview, typecheck, test, test:e2e, test:all; deps: @_bashell/slash, sharp
├── bunfig.toml, tsconfig.json, global.d.ts, playwright.config.ts, .gitignore, LICENSE
├── plugins/css-types.ts  # cópia do plugin dos outros templates
├── public/
│   ├── index.html        # casca do documento, com os marcadores <!--slash:head--> e <!--slash:app-->
│   └── robots.txt        # public/ = arquivos copiados sem processamento
├── scripts/
│   ├── dev.ts            # build + servidor estático + watch + live reload
│   ├── build.ts          # prerender de todas as rotas, bundle client, sitemap
│   └── update-imports.ts # mesmo papel dos outros templates
├── src/
│   ├── assets/images/    # imagens originais, processadas pelo pipeline
│   ├── site.ts           # config global: name, baseUrl, lang, defaults de head, config de imagens
│   ├── routes.ts         # tabela de rotas
│   ├── pages/            # componentes de página
│   ├── components/       # componentes estáticos reutilizáveis
│   ├── islands/          # componentes interativos
│   ├── client.ts         # registro de ilhas e montagem no browser
│   ├── lib/
│   │   ├── routes-core.ts   # puro: expansão de paths, validação, conflitos
│   │   ├── head-core.ts     # puro: SiteConfig + Head → string de <head>
│   │   ├── island.ts        # helper island() usado nas páginas
│   │   ├── island-core.ts   # puro: serialização e escape de props
│   │   ├── sitemap-core.ts  # puro: lista de URLs → sitemap.xml
│   │   ├── image.ts         # image() e Picture(), usados em páginas e ilhas
│   │   ├── image-core.ts    # puro: larguras, srcset, HTML do <picture>, validação
│   │   ├── images-build.ts  # processamento com sharp, cache e manifesto (só no build)
│   │   └── render-page.ts   # junta casca + head + página → documento final
│   └── styles.module.css
├── tests/                # E2E Playwright
├── .slash-cache/         # cache de imagens processadas (no .gitignore)
└── docs/superpowers/     # specs e planos (não vão para projetos derivados)
```

## Tabela de rotas

```ts
// src/lib/types.ts
export type Params = Record<string, string>;

export interface Head {
  title: string;
  description?: string;
  image?: string;          // og:image: caminho em src/assets/images/ (usa variação JPEG 1200px),
                           // caminho absoluto em public/ ("/og.png") ou URL absoluta
  canonical?: string;      // default: site.baseUrl + url
  noindex?: boolean;       // default: false; true também remove do sitemap
  jsonLd?: object | object[];
  extra?: string;          // HTML adicional no <head> (escape é do autor)
}

export interface Route<P extends Params = Params> {
  path: string;                                 // "/", "/sobre", "/projetos/:slug", "/404"
  paths?: () => P[] | Promise<P[]>;             // obrigatório se path tem ":param"
  head: Head | ((params: P) => Head | Promise<Head>);
  page: (params: P) => string | Promise<string>; // retorna HTML (htmlString)
}
```

```ts
// src/routes.ts
export const routes: Route[] = [
  { path: "/", head: { title: "Início" }, page: Home },
  { path: "/sobre", head: { title: "Sobre" }, page: About },
  {
    path: "/posts/:slug",
    paths: () => posts.map((p) => ({ slug: p.slug })),
    head: ({ slug }) => ({ title: getPost(slug).title }),
    page: ({ slug }) => PostPage(getPost(slug)),
  },
  { path: "/404", head: { title: "Página não encontrada", noindex: true }, page: NotFound },
];
```

**Regras de URL:**
- `/` → `dist/index.html`
- `/sobre` → `dist/sobre/index.html`, servida como `/sobre/`
- `/posts/:slug` com `{ slug: "ola" }` → `dist/posts/ola/index.html`
- `/404` → `dist/404.html` (caso especial, fora do sitemap)
- Os valores dos params devem casar com `[a-z0-9-]+`. Qualquer outro valor é erro de build.

## Fluxo do build (`scripts/build.ts`)

1. Limpa `dist/`.
2. Faz o bundle de `src/client.ts` com `Bun.build` (minify + hash) e coleta os nomes do JS e do CSS gerados.
3. Roda o pipeline de imagens (ver seção "Pipeline de imagens"): processa `src/assets/images/`, escreve `dist/_img/` e carrega o manifesto que `image()` consulta.
4. Expande as rotas (`routes-core.ts`): para cada rota estática, uma URL; para cada dinâmica, chama `paths()` e substitui os params. Valida params ausentes, rota dinâmica sem `paths` e URLs duplicadas.
5. Para cada URL: resolve `head`, chama `page(params)` e monta o documento com `render-page.ts`, que:
   - substitui `<!--slash:head-->` pelo `<head>` gerado (title no formato `"{title} | {site.name}"`, exceto quando `title === site.name`; description; canonical; `og:title`, `og:description`, `og:url`, `og:image`, `og:type`; `twitter:card`; JSON-LD; robots noindex; link do CSS);
   - substitui `<!--slash:app-->` pelo HTML da página;
   - inclui `<script type="module" src="/client-[hash].js">` **somente se** o HTML da página contém `data-island`.
6. Escreve cada arquivo em `dist/`.
7. Copia `public/` para `dist/`, exceto `index.html`.
8. Gera `dist/sitemap.xml` com as URLs indexáveis (absolutas, a partir de `site.baseUrl`).
9. Imprime um resumo: N páginas, tamanho do JS e do CSS, tempo.

O build roda as páginas em Bun (servidor), com `__DEV__` e `isServer` definidos. As páginas usam `htmlString`. Componentes de ilha, que rodam nos dois ambientes, escolhem o renderer como no `slash-ssr` (`typeof document !== "undefined" ? html : htmlString`), por meio de um helper exportado de `src/lib/`.

## Ilhas

**Na página (servidor):**
```ts
import { island } from "../lib/island";
import { Counter } from "../islands/counter";

html`<section>${island("counter", Counter, { start: 3 })}</section>`
```

`island(name, Component, props)` renderiza `Component(props)` com `htmlString` e devolve:
```html
<div data-island="counter" data-props='{"start":3}'>…HTML inicial…</div>
```
- As props precisam ser serializáveis em JSON. Valores não serializáveis (funções, `undefined` em profundidade, ciclos) geram erro de build com o nome da ilha.
- `data-props` é escapado para atributo HTML (`island-core.ts`).

**No browser (`src/client.ts`):**
```ts
const islands = { counter: Counter };
mountIslands(islands);
```
`mountIslands` encontra cada `[data-island]`, lê as props, **limpa o conteúdo do elemento e monta** o componente com `render(() => Component(props), el)`. Hidratar no lugar fica fora do escopo inicial. O HTML do servidor existe para SEO e para o caso sem JS, e a troca pelo componente montado acontece no carregamento do módulo. Se o HTML inicial e o montado forem iguais, não há mudança visível.

**Ilhas com estado local:** crie o estado (`createState`) no corpo do componente e envolva a view em `reactiveView(() => view\`...\`)` (de `src/lib/renderer.ts`). No browser, `reactiveView` faz a view rodar como componente reativo do Slash, que re-renderiza quando o estado muda sem recriar o estado. No build, ele só chama a função uma vez. Sem `reactiveView`, o estado volta ao valor inicial a cada atualização.

```ts
export function Counter(props: { start: number }) {
  const count = createState(props.start);
  return reactiveView(() => view`<button onClick=${() => count.set(count.get() + 1)}>Contador: ${count.get()}</button>`);
}
```

**Ilha sem registro:** em dev, `console.warn` com o nome; o HTML estático permanece.

## Pipeline de imagens

**Fontes:** `src/assets/images/**` (jpg, jpeg, png, webp, avif, svg, gif). `public/` continua para arquivos copiados sem processamento.

**Processamento** (`images-build.ts`, executado no passo 2b do build, antes de renderizar as páginas):
- Para cada imagem raster, lê as dimensões e gera as variações:
  - **larguras:** `site.images.widths` (default `[480, 960, 1440, 1920]`), sem ampliar. Larguras maiores que o original são descartadas e a largura original é incluída quando fica abaixo da maior largura configurada.
  - **formatos:** AVIF, WebP e um fallback (JPEG se a origem é jpg/jpeg; PNG se é png com canal alfa; JPEG se é png sem alfa; para origem webp/avif, o fallback é JPEG ou PNG conforme o alfa).
  - **qualidade:** `site.images.quality`, default `{ avif: 50, webp: 75, jpeg: 80 }`; PNG usa compressão máxima sem perda.
  - **metadados:** EXIF, GPS e demais metadados são removidos de todas as variações (comportamento padrão do `sharp`, mantido de forma explícita). As cores são convertidas para sRGB.
  - Variação extra para Open Graph: JPEG de 1200px de largura (ou a largura original, se for menor). É gerada sob demanda durante a renderização (passo 5), quando um `head.image` aponta para `src/assets/images/`, e também passa pelo cache.
- Saída: `dist/_img/<nome>-<hash8>-<largura>.<ext>`, em que `hash8` vem do conteúdo do arquivo original e das opções. Os nomes são estáveis e podem ter cache imutável no host.
- SVG e GIF: copiados para `dist/_img/<nome>-<hash8>.<ext>` sem processamento. `width`/`height` vêm dos metadados (`sharp` lê SVG; no caso de um SVG sem dimensões, usa o `viewBox`).
- **Cache:** `.slash-cache/images/<hash8>/` guarda as variações já geradas. Imagem com o mesmo hash não é reprocessada; o build só copia do cache para `dist/_img/`. Não há limpeza automática; apagar `.slash-cache/` é sempre seguro (o próximo build reprocessa tudo).
- **Manifesto:** `Map<caminhoRelativo, { width, height, format, hasAlpha, variants: { avif: Variant[], webp: Variant[], fallback: Variant[] }, og?: string }>`, com `Variant = { width, url }`. Fica em memória durante o build e é gravado em `.slash-cache/images-manifest.json` para depuração.
- O processamento roda com concorrência limitada (número de CPUs).

**API (`src/lib/image.ts`):**

```ts
export interface ImageDescriptor {        // serializável em JSON
  alt: string;
  width: number;
  height: number;
  src: string;                            // fallback na largura mais próxima de 960
  sources: { type: string; srcset: string }[]; // avif, webp
  fallbackSrcset: string;
}

export function image(path: string, opts: { alt: string }): ImageDescriptor; // só no build
export function Picture(
  img: ImageDescriptor,
  opts?: { sizes?: string; priority?: boolean; class?: string },
): string | Node;                          // usa htmlString no build e html no browser
```

- `image()` consulta o manifesto e devolve o descritor. Chamado fora do build (no browser), lança erro explicativo. Em ilhas, a página chama `image()` e passa o descritor como prop.
- `Picture()` gera `<picture>` com um `<source>` por formato moderno e um `<img>` com `src`, `srcset`, `sizes`, `width`, `height`, `alt`, `class`, `decoding="async"` e:
  - `priority: false` (default): `loading="lazy"`;
  - `priority: true`: `loading="eager"` e `fetchpriority="high"`.
- `sizes` default: `"100vw"`.
- Para SVG/GIF, `Picture()` gera só `<img>` com `width`, `height` e os atributos de loading.

**Erros (o build falha, com o caminho da imagem e a URL da página):**
- `image()` com um caminho que não existe em `src/assets/images/`;
- `alt` ausente ou não string (imagem decorativa exige `alt: ""` explícito);
- arquivo corrompido ou formato não suportado (mensagem do `sharp` incluída).

**Validação de ambiente:** o `sharp` tem binário nativo por plataforma. A primeira tarefa do plano de implementação confirma que ele instala e processa uma imagem com Bun neste ambiente antes de qualquer outra parte do pipeline.

## Dev (`scripts/dev.ts`)

- Roda o mesmo pipeline do build com `__DEV__ = true` (sem minify e sem hash).
- Sobe `Bun.serve` em `http://localhost:4000`:
  - `/x/` → `dist/x/index.html`; `/x` → redireciona para `/x/`; arquivos existentes são servidos direto.
  - Caminho inexistente → `dist/404.html` com status 404.
  - `/__reload` → stream SSE.
- Observa `src/` (incluindo `src/assets/images/`) e `public/` (polling no Linux, como no `slash-ssr`) com debounce de cerca de 100 ms. A cada mudança, o build roda de novo **em um subprocesso**, para que o cache de módulos do Bun não sirva versões antigas das páginas, e envia `reload` pelo SSE.
- Em dev, o `<head>` recebe um script inline que abre o `EventSource("/__reload")` e recarrega a página.
- Se o build falha em dev, o erro aparece no terminal, as respostas HTML viram uma página de erro (overlay simples com a mensagem e o stack) e o servidor continua de pé até a próxima mudança.

`bun run preview` serve o `dist/` de produção com o mesmo servidor, sem watch e sem reload.

## Tratamento de erros (build de produção)

Em qualquer um destes casos, o processo sai com código ≠ 0 e uma mensagem que diz a rota, a URL ou o param envolvido:

- rota dinâmica sem `paths`;
- `paths()` retornando um objeto sem algum param do `path`;
- param fora de `[a-z0-9-]+`;
- duas rotas gerando a mesma URL;
- exceção em `head()` ou `page()` (com URL e stack);
- props de ilha não serializáveis;
- `public/index.html` sem os marcadores `<!--slash:head-->` ou `<!--slash:app-->`;
- erros de imagem (ver "Pipeline de imagens").

Rota `/404` ausente gera apenas um aviso.

## Testes

**Unitários (`bun test src/`):** cobrem os módulos `*-core.ts`:
- `routes-core`: expansão estática e dinâmica, params ausentes ou inválidos, duplicatas, mapeamento URL → caminho de arquivo, caso `/404`.
- `head-core`: formato do title, canonical default, OG e Twitter, JSON-LD, noindex, escape de valores.
- `island-core`: serialização, escape e rejeição de valores não serializáveis.
- `sitemap-core`: URLs absolutas, exclusão de noindex e 404.
- `render-page`: substituição dos marcadores e inclusão condicional do script.
- `image-core`: escolha de larguras sem ampliação, escolha do fallback por formato e alfa, `srcset`/`sizes`, HTML do `<picture>` (com e sem `priority`), SVG/GIF, validação de `alt`, serialização do descritor.

**Integração (`bun test src/`):** `images-build` processa duas imagens de fixture (uma foto JPEG e um PNG com transparência) para um diretório temporário com `sharp` e confere arquivos gerados, dimensões, formatos, nomes com hash e reaproveitamento do cache na segunda execução.

**E2E (Playwright, `tests/`):** builda o exemplo e serve com `preview`:
- cada URL do exemplo responde 200 com o `<title>` e a description esperados;
- `/sobre/` não carrega JS e `/` carrega;
- com JavaScript desativado, o conteúdo de `/` está visível;
- a ilha `counter` incrementa ao clicar;
- uma URL inexistente devolve o `404.html` com status 404;
- `sitemap.xml` lista as URLs indexáveis;
- a home tem `<picture>` com `<source>` AVIF e WebP, os arquivos de `srcset` respondem 200, a imagem do hero tem `fetchpriority="high"` e as imagens da galeria têm `loading="lazy"`;
- `og:image` aponta para um JPEG existente.

## Exemplo incluído

- `/`: home com uma imagem de hero (`priority`), a ilha `counter` e a ilha `gallery`, que recebe descritores de imagem como props e troca a imagem ativa com botões anterior/próximo
- `/sobre`: página estática
- `/posts/:slug`: dois posts vindos de `src/data/posts.ts`
- `/404`

## Fora do escopo

- Hidratar ilhas no lugar (sem limpar o elemento).
- Recortes e transformações de imagem além de redimensionar e converter (crop, foco, blur placeholder, art direction por breakpoint).
- Processamento de imagens remotas (só arquivos locais em `src/assets/images/`).
- Roteamento por arquivos, Markdown/MDX e coleções de conteúdo.
- Mudanças no core `@_bashell/slash` e publicação de nova versão.
- Um CLI `create-slash-*`. Projetos derivados são criados copiando o template.

## Como a landing da Bashell vai usar

1. Copiar `packages/slash-ssg` para `bashell-landing-page`, sem `.git/`, `docs/`, `node_modules/`, `dist/` e `.slash-cache/`.
2. Trocar `@_bashell/slash: workspace:*` por `^0.3.0` e remover qualquer alias para `../../slash/src`.
3. Substituir o exemplo pelas páginas da agência, com um spec próprio no repositório da landing.
