# Gerador de landing pages estáticas com slash-ssg — design

Data: 2026-10-19 · Status: aprovado em conversa, aguardando revisão da spec escrita

## 1. Objetivo

Produzir, com o usuário e o Claude (skill dedicada), landing pages estáticas prontas para entregar a agências:
bonitas (blocos do canvas "page templates" sobre o grid de 12 colunas), com código bem escrito (spec tipado,
TDD, AAA) e **em no máximo 30 minutos por página**, do briefing ao push.

### Critérios de sucesso

1. Uma landing de vendas nova sai do briefing ao push em ≤ 30 min.
2. Cada página gerada passa no `bun run verify` local: Lighthouse mobile ≥ 95 (performance, acessibilidade,
   boas práticas, SEO), WCAG AA (axe sem violações, contraste dos tokens), regressão visual e grid em 5
   breakpoints, orçamento de peso (JS ≤ 15 KB gz, primeira carga ≤ 300 KB).
3. Nenhuma página é publicada com conteúdo pendente, inventado ou escrito pelo Claude sem liberação.
4. Cobertura de testes ≥ 90% (meta 100%) em todos os pacotes novos ou alterados.

### Decisões do usuário

| Tema | Decisão |
| --- | --- |
| Operação | Usuário + Claude via skill dedicada a landing pages com slash-ssg |
| Fonte da verdade | `site.spec.ts` tipado no repo; canvas de Design opcional (desenho/aprovação) |
| Organização | Um repositório por cliente; a agência recebe o repo e faz o próprio deploy |
| Entrega | Repo no GitHub, **sem GitHub Actions**: toda verificação é local |
| Escopo v1 | Um template completo: **landing de vendas** |
| Conversão | WhatsApp, link de checkout com UTM, pixels (GTM, GA4, Meta, Google Ads, TikTok) com consentimento LGPD |
| Conteúdo | Agência fornece, Claude produz ou Claude complementa — os três modos no mesmo spec |
| SEO | Meta/OG, JSON-LD automático, sitemap, robots, semântica validada |
| Processo | TDD em tudo; E2E em vários breakpoints ao fim de cada página |
| Velocidade | Testes e aprovações nunca impedem a entrega em 30 min |

### Fora da v1

Formulário de lead (vem com o template de captura), templates captura/produto/lançamento/evento, `eject` de
blocos, API de Conversões do Meta, painel visual, deploy automático, CI no GitHub.

## 2. Arquitetura

Abordagem escolhida: **kit versionado + spec interpretado + CLI de scaffold**. Alternativas descartadas: blocos
copiados para cada repo (correções não propagam, testes repetidos) e geração direta de código (sem contrato
tipado, qualidade imprevisível).

```
slash-meta/packages/
  slash/                  biblioteca reativa (inalterada, salvo necessidade)
  slash-ui/               NOVO  @_bashell/slash-ui — blocos, tema, ilhas, spec, SEO, analytics
  create-slash-landing/   NOVO  CLI de scaffold de um projeto de cliente
  slash-ssg/              ALTERADO  rota do spec, portão estendido, verify, approve
skill slash-landing       NOVA  especialista em landing pages com slash-ssg
```

Projeto de cliente gerado (`bun create slash-landing sorriso`):

```
sorriso/
  site.spec.ts            fonte única da página
  theme.ts                tema do cliente
  content-release.json    liberações assinadas de conteúdo
  src/assets/images/      imagens do cliente
  package.json            depende de @_bashell/slash-ui@<versão fixa>
  .githooks/pre-push      roda bun run verify
```

Dependências: `create-slash-landing` → template slash-ssg; projeto de cliente → `@_bashell/slash-ui` →
`@_bashell/slash`. O slash-ui não conhece o projeto de cliente; o slash-ssg conhece o slash-ui só pela
função `renderLanding` e pelo tipo `LandingSpec`.

Regra do monorepo mantida: toda mudança em `slash` é validada em slash-spa, slash-ssr e slash-ssg.

## 3. slash-ui

### 3.1 Spec (`@_bashell/slash-ui/spec`)

```ts
import { defineLanding, c, img } from "@_bashell/slash-ui/spec";
import { theme } from "./theme";

export default defineLanding({
  site: { name: "Clínica Sorriso", baseUrl: "https://sorriso.com.br", lang: "pt-BR" },
  theme,
  conversion: {
    whatsapp: { number: "5511999999999", message: "Olá! Vim pelo site." },
    checkout: { url: "https://pay.kiwify.com.br/abc", forwardUtm: true },
  },
  analytics: { consent: true, gtm: "GTM-XXXX", metaPixel: "123456789" },
  seo: {
    title: c.claude("Implante dentário em 1 dia | Clínica Sorriso"),
    description: c.claude("..."),
    image: img("og.jpg"),
    imageAlt: "Fachada da Clínica Sorriso",
    business: { type: "Dentist", address: { /* ... */ }, phone: "+55 11 99999-9999" },
  },
  blocks: [
    { type: "hero", variant: { media: "video", position: "center", ctas: 1, proof: "rating" }, tone: "dark",
      action: "checkout", content: { title: c.agency("Implante em 1 dia"), poster: img("hero.jpg", "Paciente sorrindo após o implante") } },
    { type: "testimonials", variant: { layout: "mosaic", items: 6, rating: true },
      content: { items: [c.fictitious({ name: "Ana", text: "..." })] } },
    { type: "faq", content: { items: c.pending("FAQ do cliente") } },
    { type: "cta", tone: "dark", action: "whatsapp", content: { /* ... */ } },
    { type: "footer" },
  ],
  whatsappFab: true,
});
```

Regras de tipo (erro de compilação):

- `blocks` é união discriminada por `type`; `variant` só aceita as variantes do bloco; `content` exige os campos
  que a variante usa (ex.: `media: "video"` exige `videoUrl` e `poster`).
- `action` aceita `"whatsapp" | "checkout"` e só se o canal correspondente estiver em `conversion`.
- Toda imagem exige `alt` (via `img(path, alt)` ou campo `*Alt`).

Regras de build (erro com mensagem que aponta o bloco):

- `tone: "dark"` só no hero e no CTA final; `tone` omitido é atribuído alternando `light`/`gray`; dois blocos
  vizinhos com o mesmo tom explícito é erro.
- Exatamente um `h1` (título do hero); hierarquia de headings sem saltos.

### 3.2 Origem do conteúdo

| Marcador | Significado | Portão |
| --- | --- | --- |
| `c.agency(x)` | fornecido pela agência | passa |
| `c.claude(x)` | escrito pelo Claude | exige liberação |
| `c.fictitious(x)` | dado inventado (exemplo, depoimento) | exige liberação; nunca entra em JSON-LD |
| `c.pending(motivo)` | ainda falta | sempre bloqueia |

Valores sem marcador são tratados como `agency`. A liberação usa o mecanismo existente de
`content-release.json` (digest + `approvedBy`/`approvedAt`/`note`), agora calculado sobre os itens `claude` e
`fictitious` do spec.

### 3.3 Blocos

Portados do board `LpVendas` do canvas "page templates" (https://claude.ai/artifact/24Tfd3K6uzQW3aiitqH6qp),
**com todas as variantes que o canvas define para cada bloco**:

| Código | Canvas | Variante usada na landing de vendas |
| --- | --- | --- |
| `hero` | Hero01 | mídia vídeo, centro, 1 CTA, prova avaliação, escuro |
| `features` | Feat01 | 2 colunas, 4 itens, ícone ao lado, card contorno |
| `featureSplit` | Feat02 | mídia à direita, detalhe lista, sem CTA |
| `about` | About01 | imagem à esquerda, com números |
| `testimonials` | Test01 | mosaico, 6 itens, com avaliação |
| `pricing` | Price01 | 1 plano, pagamento único, com garantia |
| `faq` | Faq01 | coluna única, 8 itens, sem contato |
| `cta` | Cta01 | faixa, botões, 1 CTA, escuro |
| `footer` | Foot01 | mínimo |
| `whatsappFab` | — (regra de UX) | botão flutuante de WhatsApp |

Cada bloco é uma função pura `(props, ctx) => SafeHtml` com CSS Module próprio, sem cor literal (só tokens).
Vídeo do hero usa *facade*: capa otimizada, player do YouTube/Vimeo carregado só no clique. A tabela de
correspondência canvas → código fica na skill.

### 3.4 Tema

- `Theme` tipado em TS → CSS vars. Tokens do canvas: `bg`, `fg`, `muted`, `soft`, `line`, `card`, botão
  (`bb`/`bf`), input; tons `light`, `gray`, `dark`, `accent`, `photo`.
- Tipografia (famílias, escala), raio, sombra.
- Build verifica contraste AA de todo par texto/fundo em todos os tons e falha apontando o token.
- Fontes self-hosted (woff2 copiados no build), sem requisição ao Google Fonts.
- Tema-base neutro no kit (IBM Plex Sans/Mono, como o canvas).

### 3.5 Grid

Utilitários CSS do kit: container 1200 px com padding 24 (1152 úteis), 12 colunas, gutter 24, span por
`calc((100% - 264px)/12*n + 24px*(n-1))`, grades de cards de 2/3/4/6 colunas iguais; no mobile 4 colunas com
margem e gutter de 16 px. Teste de arquitetura proíbe larguras soltas (`minmax(<px>)`, `flex` com base em px,
containers fora de 1200) nos CSS dos blocos.

### 3.6 Ilhas (JS do cliente)

| Ilha | Função |
| --- | --- |
| `utm` | repassa `utm_*`, `gclid`, `fbclid` da URL aos links de checkout |
| `consent` | banner LGPD; carrega os scripts de analytics só após aceite; lembra a escolha |
| `track` | dispara eventos padrão nos pixels configurados |
| `videoFacade` | troca a capa pelo player no clique |
| `faq` | só se o acordeão precisar de JS (preferência: `<details>` nativo, sem JS) |

Eventos padrão:

| Ação | Meta | GA4 | Google Ads | TikTok |
| --- | --- | --- | --- | --- |
| Página carregada | `PageView` | `page_view` | — | `PageView` |
| Oferta visível | `ViewContent` | `view_item` | — | `ViewContent` |
| Clique WhatsApp | `Contact` | `generate_lead` | conversão (opcional) | `Contact` |
| Clique checkout | `InitiateCheckout` | `begin_checkout` | conversão | `InitiateCheckout` |

Cada evento leva `block` e `variant` do CTA clicado.

### 3.7 SEO

Gerado por `renderLanding` sobre o `Head` existente do slash-ssg:

- `title`, `description`, canonical, OG e Twitter cards, `og:image` com alt, favicon e manifest do tema.
- JSON-LD: `Organization` ou `LocalBusiness` (de `seo.business`), `Product`/`Offer` (do bloco `pricing`),
  `FAQPage` (do bloco `faq`), `AggregateRating` só com depoimentos `agency`.
- `sitemap.xml` (existente) e `robots.txt` apontando para ele; `noindex` respeitado.
- Imagens com `width`/`height` (sem CLS).

## 4. slash-ssg (template)

- Rota `/` renderiza `site.spec.ts` via `renderLanding`; `/404` mantido; páginas de exemplo saem do template de
  landing (continuam nos testes de fixture do framework).
- Portão (`bun run gate`) passa a percorrer o spec: `pending`, `claude`/`fictitious` sem liberação,
  título 10–60 caracteres, descrição 50–160, `og:image` presente, JSON-LD válido.
- `bun run approve`: lista os itens a liberar, pede confirmação e grava `content-release.json` assinado.
- `bun run verify`: pipeline da seção 6.
- `robots.txt` gerado no build.

## 5. create-slash-landing (CLI)

`bun create slash-landing <pasta> [--github <owner/repo>]`:

1. Falha se a pasta existir ou se `bun` (e `gh`, com `--github`) faltar — antes de escrever qualquer arquivo.
2. Copia o template slash-ssg de landing; grava `site.spec.ts` (esqueleto de vendas com conteúdo `pending`),
   `theme.ts` (tema-base) e `content-release.json` vazio.
3. `bun install` (cache local), `git init`, `git config core.hooksPath .githooks`, commit inicial.
4. Com `--github`: `gh repo create <owner/repo> --private --source . --push`. Nenhum workflow de Actions é criado.

Erro em qualquer passo remove a pasta criada.

## 6. Verificação local (`bun run verify`)

Ordem, parando no primeiro erro:

1. `typecheck`, testes unitários e de arquitetura.
2. Portão de conteúdo e SEO.
3. Build.
4. Orçamento de peso: JS ≤ 15 KB gz, primeira carga ≤ 300 KB.
5. E2E Playwright, 5 projetos em paralelo (360, 768, 1024, 1280, 1440 px):
   bordas no grid (medidas no DOM), sem rolagem horizontal, alvos de toque ≥ 44 px, axe WCAG AA, nenhum pixel
   antes do consentimento, evento certo por CTA, UTM no checkout, regressão visual contra a base aprovada.
6. Lighthouse mobile ≥ 95 nas 4 categorias (execuções em paralelo).

- Base visual: gravada na primeira execução aprovada (`bun run verify --update-baseline`).
- Durante a edição só rodam typecheck e portão (watch do `bun run dev`); E2E e Lighthouse rodam uma vez, ao fim.
- Hook de pre-push roda o `verify`, reaproveitando o resultado se nenhum arquivo mudou desde o último verde
  (hash do conteúdo em `.verify-cache`, fora do git).

### Orçamento de tempo (30 min)

| Etapa | Limite |
| --- | --- |
| Scaffold | ≤ 1 min |
| Spec + tema (skill) | ≤ 15 min |
| Revisão no `dev` + `approve` | ≤ 10 min |
| `verify` | ≤ 3 min |

O E2E do `create-slash-landing` mede scaffold e `verify` e falha se passar do limite.

## 7. Skill `slash-landing`

Especialista em landing pages estáticas com slash-ssg. Conhece o catálogo de blocos e variantes, a tabela
canvas → código, as regras de UX (WhatsApp para contato, formulário só para lead, sem estados de demo,
alternância de tons, grid de 12 colunas), o spec, o portão e o `verify`.

Fluxo de página nova:

1. Entrevista curta: cliente, oferta, preço, WhatsApp, checkout, pixels, material já fornecido.
2. Roda o CLI.
3. Escreve `theme.ts` (marca do cliente) e `site.spec.ts` (briefing e/ou board do canvas), marcando a origem de
   cada conteúdo; aciona o agente copywriter só para lacunas.
4. Sobe `bun run dev` para o usuário revisar.
5. Mostra o que o portão bloqueia; o usuário libera com `bun run approve`.
6. Roda `bun run verify`; só declara pronto com tudo verde.
7. Commit e push. Transferência do repo para a agência é manual.

## 8. Testes

Tudo em TDD, padrão AAA, `bun test`; Playwright para E2E. Cobertura ≥ 90%, meta 100%.

| Pacote | O que testar |
| --- | --- |
| slash-ui | HTML de cada bloco × variante (happy-dom); tema e contraste; ilhas; tipos do spec (fixtures que **não** devem compilar); regras de tom/heading; JSON-LD; eventos |
| slash-ssg | rota do spec, portão estendido, `approve`, `robots.txt`, `verify` |
| create-slash-landing | gera projeto em pasta temporária e roda o `verify` dele (E2E do gerador, com orçamento de tempo); limpeza em erro |
| slash (se alterado) | validado em slash-spa, slash-ssr e slash-ssg |

## 9. Riscos

- **Lighthouse ≥ 95 com vídeo no hero:** mitigado por *facade*; se não bastar, a variante vídeo usa imagem até o clique.
- **Tempo do `verify`:** Playwright e Lighthouse em paralelo e cache do hook; o orçamento é testado.
- **Publicação do slash-ui:** os projetos de cliente dependem de versão publicada no npm; até a primeira
  publicação, o CLI aceita `--kit link` para usar o pacote local do monorepo.
