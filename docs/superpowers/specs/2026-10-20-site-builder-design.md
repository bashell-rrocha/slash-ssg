# Modelos de landing e sites institucionais com slash — design

Data: 2026-10-20 · Revisão 1 · Status: aprovada (2026-10-20) · Estende a spec
`2026-10-19-slash-landing-generator-design.md` (rev 3), que continua valendo onde esta não diz o contrário.

## 1. Objetivo

Evoluir o `slash-landing` (`/home/dev/Projetos/slash-meta/packages/slash-landing`, `main` em `577532a`, v0.7.0) em duas
fases:

- **Fase 1 — modelos de landing:** `--template landing-page` (o atual `landing-sales` renomeado) ganha os modelos do
  canvas `captura | vendas | produto | lançamento | evento`, com formulário de lead.
- **Fase 2 — sites institucionais estáticos:** `--template one-page` e `--template multi-page` (modelos
  `clássico | catálogo`), com coleções que geram rotas, SEO por rota, sitemap, migalhas e `verify` em todas as rotas.

Fora do escopo: blog e painel (recurso futuro, nada preparado agora), BLOG-01, CART-01, SLOT-01, POST-0x.

### Requisito inegociável: extensão, não substituição

1. `landing-page --model vendas` (padrão) gera **exatamente** o que `landing-sales` gera na v0.7.0, fora `src/ui/`
   (que evolui por adição). Prova: teste com a árvore de arquivos (caminho → sha256) gravada na v0.7.0.
2. Os arquivos de `templates/landing-page/files/` não mudam além da pasta renomeada; modelos novos são overlays
   adicionais.
3. Os três templates usam o mesmo `ui/`. A API pública de `ui/` só ganha coisas: nenhum export some, nenhuma prop
   vira obrigatória, nenhuma variante muda de marcação. Prova: teste de compatibilidade com a lista de exports da
   v0.7.0, o E2E da galeria com as bases visuais atuais e o projeto Mustache Barber atualizado via `copyUi` passando
   no próprio typecheck e testes ao fim de cada fase. Quebra inevitável só como 1.0.0, com passo de migração.
4. `landingPage()` continua exportada com a mesma assinatura e a mesma saída.
5. Testes da landing e `bun run gate` verdes em toda tarefa; `create` + `verify` de cada template e modelo vira teste
   de regressão fixo (`tests/e2e/cli.e2e.test.ts`).

### Critérios de sucesso

- Cada template/modelo sai do `create` com `verify` verde, sem edição.
- Os critérios da rev 3 (Lighthouse ≥ 95, axe, peso, ≤ 30 min por landing, cobertura ≥ 90%) valem para todas as
  rotas geradas.

## 2. CLI

```
slash create <pasta> [--template landing-page|one-page|multi-page] [--model <modelo>] [--github owner/repo]
```

| Template | Modelos | Padrão |
| --- | --- | --- |
| `landing-page` (padrão sem `--template`) | `vendas`, `produto`, `lancamento`, `evento`, `captura` | `vendas` |
| `one-page` | — (recusa `--model`) | — |
| `multi-page` | `classico`, `catalogo` | `classico` |

- `--template landing-sales` vale na v0.8.x como apelido de `landing-page`, com aviso
  (`--template landing-sales está obsoleto; use --template landing-page (removido na 0.9.0)`); sai na 0.9.0.
- Modelo desconhecido: erro com a lista do template. `--model` sem template aplica-se ao padrão (`landing-page`).
- `create.ts` e `overlay.ts` deixam de importar o manifest da landing: um registro `templates/index.ts` mapeia nome →
  manifest. Template novo continua sem exigir mudança nos comandos.

### 2.1 Manifest e camadas

`TemplateManifest` ganha, por adição:

- `inherits?: TemplateName` — aplica antes os `files/` (e `remove`, `packageJson`, `gitignore`, `architecture`) do
  template herdado. `one-page` e `multi-page` herdam `landing-page` (tema, ui-host, scripts, AGENCIA.md, origin.ts,
  placeholders) e trocam páginas, dados e E2E.
- `models?: { default: string; names: readonly string[] }` — o modelo aplica `templates/<t>/models/<m>/files/` por
  cima de `files/`. `vendas` não tem pasta: é `files/` puro.

Ordem: clone do slash-ssg → camadas herdadas → `files/` do template → `models/<m>/files/` → `copyUi`.

## 3. Componentes novos e variantes (`ui/`)

Mesmas regras da rev 3 (funções puras, CSS Module, só tokens, grid de 12 colunas, galeria, SEO embutido). Cada
variante nova é mais um membro da união `variant` da seção; nada existente muda.

| Seção | Canvas | Fase | Novo |
| --- | --- | --- | --- |
| `Header` | Nav01 | 1 | `"bar"` (fixo claro, âncoras ou páginas, CTA) · `"transparent"` (sobre hero de fundo, sólido ao rolar) |
| `Header` | Nav01 | 2 | prop `currentPath` → `aria-current="page"` no link da página |
| `Hero` | Hero01 | 1 | `"split-image"` (texto à esquerda, `ratio` `6/6`\|`7/5`) · `"split-form"` (7/5 com `LeadForm`) · props opcionais `secondaryCta`, `proofNote`; `background-carousel` com 1 slide cobre "imagem de fundo tela cheia" |
| `LogoStrip` | LOGO-01 | 1 | `"title-above"` · `"title-side"` |
| `Features` | Feat01 | 1 | `"top-icon"` · `"side-icon-compact"` (sem cabeçalho, compacta); prop `columns` 2\|3\|4 |
| `Features` | Feat01 | 2 | `"numbered"` |
| `FeatureSplit` | Feat02 | 1 | `"media-right-list"` · `"media-left-numbers"` · `"media-right-numbers"`; prop opcional `link` |
| `Testimonials` | Test01 | 1 | `"grid"` (estrelas opcionais) · `"carousel"` (scroll-snap, sem JS) |
| `Testimonials` | Test01 | 2 | `"featured"` (um depoimento em destaque com foto) |
| `PhotoGallery` | GAL-01 | 1 | `"mosaic"` (legenda opcional) |
| `PhotoGallery` | GAL-01 | 2 | `"carousel"` (scroll-snap, miniaturas) |
| `Schedule` | SCHED-01 | 1 | `"list"` (dias empilhados, cada dia com horários); `eventSchema` (`Event`) |
| `Team` | TEAM-01 | 1 | `"grid"` (colunas 3\|4, redes opcionais por pessoa) |
| `Locations` | LOC-01 | 1 | `"map-side"` (1 ou várias unidades; ação `whatsapp`\|`route`; mapa = imagem estática + link para o Google Maps, sem iframe); `locationsSchema` |
| `Faq` | Faq01 | 1 | `"two-columns"` (cabeçalho 4 col. + lista 8 col.) |
| `CtaSection` | Cta01 | 1 | `"card"` com `action` `{ kind: "cta" }` ou `{ kind: "lead" }` (`LeadForm`) |
| `Footer` | Foot01 | 1 | `"simple"` (marca, links, redes, linha legal) · `"full"` (3 colunas, redes, negócio) |
| `About` | About01 | 2 | `"media-left-numbers"` · `"story"` (números, valores e marcos em linha) |
| `Cards` | SERV-01 | 2 | `"grid"` (mídia imagem\|ícone, preço opcional, link para o item) · `"alternating"`; `itemListSchema`. Genérico: serve a serviços, itens de catálogo e relacionados |
| `PageHeader` | PAGE-01 | 2 | `"compact"` · `"media"`; migalhas (`Breadcrumbs`) e `breadcrumbSchema`; único `h1` das páginas internas |
| `Search` | SEARCH-01 | 2 | `"sidebar-filters"` (ver 5.3) |

Layout: `sitePage(parts)` em `ui/site-page.ts` (fase 2) recebe as mesmas partes de `LandingPageParts`;
`landingPage(parts)` passa a delegar a ele e devolve o mesmo HTML.

### 3.1 Formulário de lead (fase 1)

> **Decisão assumida (pergunta 3 em aberto):** destino por **webhook genérico**. Trocar antes da tarefa 1.7 se o
> usuário escolher outra opção.

- `LeadForm(props, host)` em `ui/lead/`: campos `name` (obrigatório), `phone` (obrigatório), `email` (opcional,
  ligável), caixa de consentimento LGPD obrigatória com link para a privacidade, campo-isca oculto `company`.
- Sem JS: `<form method="post" action="<endpoint>">` nativo.
- Ilha `lead`: validação nativa; `POST` JSON `{ name, phone, email?, page, utm_* }` com tempo-limite de 10 s;
  estados enviando (`aria-busy`, botão desabilitado), sucesso (mensagem com `role="status"`, foco nela) e erro
  (`role="alert"` + link de WhatsApp como alternativa). Isca preenchida: finge sucesso e não envia.
- Medição: `generate_lead` com `method: "form"` só no sucesso; nenhum dado pessoal no `dataLayer`.
- Dados: `site.lead = { endpoint, successMessage }`; `endpoint` precisa ser `https://`; `pending(...)` até a agência
  preencher (o `check` bloqueia).

## 4. Modelos de landing (fase 1)

Composição de cada `src/pages/home.ts` (ordem do canvas):

| Modelo | Seções |
| --- | --- |
| `vendas` | inalterado (LpVendas) |
| `produto` | Header bar · Hero split-image 6/6 (2 CTAs, nota) · LogoStrip title-above · Features top-icon (6) · FeatureSplit media-left-numbers · FeatureSplit media-right-list · Testimonials carousel · Pricing toggle (3 planos) · Faq two-columns · Cta band (WhatsApp) · Footer full |
| `lancamento` | Header transparent · Hero background-carousel (1 slide, 2 CTAs) · Features side-icon-compact (4) · PhotoGallery mosaic (legendas) · FeatureSplit media-left-list · FeatureSplit media-right-numbers · Pricing simple (1 plano) · Cta card lead · Faq two-columns · Cta band (WhatsApp) · Footer simple |
| `evento` | Header bar · Hero split-image 7/5 · LogoStrip title-side · Features top-icon · Schedule list (2 dias) · Team grid (8) · Pricing simple (2 planos) · Locations map-side (1 unidade, rota) · Faq two-columns · Cta band (botão) · Footer simple |
| `captura` | Header bar · Hero split-form 7/5 (avaliação) · LogoStrip title-side · Features top-icon · FeatureSplit media-left-list · Testimonials grid (estrelas) · Faq two-columns · Cta band (WhatsApp) · Footer simple |

Cada modelo traz `src/pages/home.ts`, `src/data/content.ts` (conteúdo `fictitious`, como o `vendas`) e
`tests/e2e/landing.spec.ts` quando o E2E difere (ex.: formulário).

## 5. Sites institucionais (fase 2)

### 5.1 Estrutura de conteúdo

```
src/data/site.ts          dados comuns (nome, WhatsApp, GTM, negócio, redes, menu)
src/data/pages/<id>.ts    conteúdo de cada página fixa (seo + seções)
src/data/collections/<nome>.ts  itens de uma coleção
src/site/collection.ts    defineCollection (genérico)
src/site/layout.ts        pageLayout(route, main) e routeHead(path, seo)
src/pages/<id>.ts         compõe as seções da página
src/routes.ts             rotas fixas + rotas das coleções
```

`defineCollection<T extends { slug: string; title: string; category?: string }>({ basePath, items, categoryMin = 2 })`
devolve `itemPaths()`, `bySlug(slug)`, `categories()` (só as com ≥ `categoryMin` itens) e `categoryPaths()`. Não sabe
o que é "serviço" nem "produto". Slug duplicado ou vazio é erro no build com o caminho do item.

### 5.2 SEO por rota, sitemap e migalhas

- `routeHead(path, seo)`: `canonical = baseUrl + path`, title/description/og por rota, JSON-LD da rota.
- Sitemap e robots.txt: os do slash-ssg (`scripts/ssg/build-site.ts`); rotas `noindex` (404) ficam fora.
- Migalhas: `PageHeader` mostra a trilha e emite `BreadcrumbList`; Início → seção → item.
- Combinação de filtros nunca vira URL; `?q=` não é gerado.

### 5.3 Catálogo (SEARCH-01, opção C — híbrido)

- `/catalogo`: todos os itens no HTML; `/catalogo/<categoria>`: página estática por categoria com ≥ 2 itens
  (`ItemList`); `/catalogo/<item>`: página do item (`Product` ou `Service`, `BreadcrumbList`, WhatsApp com
  "Olá! Tenho interesse em <item>").
- `Search` `"sidebar-filters"`: filtros de categoria são links para as páginas de categoria (sem JS funcionam);
  a ilha `search` acrescenta busca por texto, filtro instantâneo e paginação de 12 por página no navegador. Sem JS,
  a busca por texto não aparece e todos os itens ficam visíveis.

### 5.4 Templates

| Template / modelo | Páginas |
| --- | --- |
| `one-page` | `/` (OnePage): Header transparent (âncoras) · Hero background-carousel · About media-left-numbers · Cards grid (ícone) · PhotoGallery mosaic · Testimonials grid · Faq two-columns · Locations map-side (WhatsApp) · Cta band · Footer simple; WhatsApp é a única ação |
| `multi-page --model classico` | `/` · `/sobre` · `/servicos` · `/servicos/<slug>` · `/equipe` · `/contato` (InstInicio…InstContato, sem BLOG-01) |
| `multi-page --model catalogo` | `/` · `/catalogo` · `/catalogo/<categoria>` · `/catalogo/<slug>` (CatInicio, CatLista, CatItem) |

Todas com `/404`, WhatsappFab, ConsentBanner, GTM e marcadores `utm`/`track`.

## 6. `verify` em todas as rotas (fase 2)

- Etapas 4 e 5 (HTML e peso) rodam em cada `dist/**/index.html`; falha aponta rota + seção.
- Novas checagens: canonical igual à URL da rota; toda rota indexável no `sitemap.xml`; nenhuma `noindex` nele.
- Lighthouse: `/` e uma rota de cada padrão (fixa, coleção, categoria), para caber em ≤ 3 min.
- E2E do projeto percorre todas as rotas nos 5 breakpoints.

## 7. Skill `slash-landing`

`/home/dev/Projetos/squad-builder/plugins/slash-builder/skills/slash-landing/` (`SKILL.md` e
`reference/commands.md`): fim da fase 1, modelos e `--model`, formulário de lead; fim da fase 2, `one-page`,
`multi-page`, coleções e `verify` por rota; `landing-sales` sai das referências.

## 8. Versões

- Fase 1 → `v0.8.0` (com o apelido `landing-sales`). Fase 2 → `v0.9.0` (sem o apelido).
- Mustache Barber (`/home/dev/Projetos/mustache-barber`) atualizado via `copyUi` ao fim de cada fase, com o
  typecheck e os testes dele verdes.

## 9. Riscos

- **Saída do `vendas` mudar sem querer:** teste da árvore da v0.7.0 em toda tarefa.
- **Endpoint de lead indisponível ou com CORS errado:** estado de erro com WhatsApp; `AGENCIA.md` explica o
  requisito de CORS do destino.
- **Tempo do `verify` com muitas rotas:** HTML e peso são baratos; Lighthouse por amostra de padrões.
- **Herança entre templates acoplar demais:** `inherits` é de um nível só; teste impede ciclo.

## 10. Emendas da fase 1 (2026-10-20, v0.8.0)

Decisões tomadas durante a execução que mudam o texto acima; valem sobre ele.

- **§3.1, dados do lead:** o modelo nasce com `site.lead.endpoint: fictitious("https://hooks.exemplo.com.br/lead")`,
  não `pending(...)`. Com `pending` o `LeadForm` não renderiza e `approve`/`verify` travam, o que contradiz a §1
  ("cada modelo sai do create com verify verde"); o `approve` lista o endpoint fictício para a agência trocar.
  `pending` continua possível para quem quiser bloquear o `check`. O telefone exige pelo menos 10 dígitos; a isca
  `company` tem rótulo neutro.
- **§4, formulário só na captura:** o formulário de lead aparece só no modelo `captura`. Nos demais o contato é o
  botão do WhatsApp; o `lancamento` usa `Cta card` com ação `cta` (WhatsApp) no lugar de `Cta card lead`. O `LeadForm`
  e o `Cta card lead` continuam em `ui/`.
- **§4, captura:** sem campo de e-mail e sem o botão flutuante do WhatsApp, para o formulário inteiro caber acima da
  dobra em 360×800 sem nada por cima.
- **§3, Header e Hero no celular e no desktop:** abaixo de 768 px o CTA do Header fica oculto (com JS; sem JS ele
  aparece, porque o menu depende da ilha); com `secondaryCta` os dois botões do Hero ficam lado a lado, quebrando só
  quando não cabem; avaliação e CTAs seguem o alinhamento do texto da variante; no `split-form` o texto alinha ao
  topo do card do formulário.

### 10.1 Emendas antes da fase 2 (2026-10-20)

- **§4 e §5.4, Faq:** modelos e sites usam o Faq com título acima das perguntas (`single`); o `two-columns` fica só
  como variante disponível.
- **§5.1, código de site:** `src/site/` é compartilhado e genérico (não lê `src/data`); o layout que lê os dados do
  site mora em `src/pages/layout.ts`.
- **§6, verify em todas as rotas:** as páginas são os `dist/**/*.html` (o slash-ssg grava `/a` em `a.html`), sem
  `404.html`; canonical = `baseUrl` sem `/` final + rota.
