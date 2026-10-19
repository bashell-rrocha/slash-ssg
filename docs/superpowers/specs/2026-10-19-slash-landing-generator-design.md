# Construção de landing pages estáticas com slash — design

Data: 2026-10-19 · Revisão 2 (arquitetura em pacotes separados) · Status: aguardando revisão do usuário

## 1. Objetivo

Produzir, com o usuário e o Claude (skill dedicada), landing pages estáticas derivadas do slash-ssg, prontas para
entregar a agências: bonitas (seções do canvas "page templates" sobre o grid de 12 colunas), com código bem escrito
(TDD, AAA, tipos) e **em no máximo 30 minutos por página**, do briefing ao push.

### Critérios de sucesso

1. Uma landing de vendas nova sai do briefing ao push em ≤ 30 min.
2. Cada página passa no `verify` local: Lighthouse mobile ≥ 95 (performance, acessibilidade, boas práticas, SEO),
   WCAG AA (axe sem violações, contraste dos tokens), regressão visual e grid em 5 breakpoints, orçamento de peso
   (JS ≤ 15 KB gz, primeira carga ≤ 300 KB).
3. Nenhuma página é publicada com conteúdo pendente, inventado ou escrito pelo Claude sem liberação.
4. Cobertura de testes ≥ 90% (meta 100%) em todo pacote novo ou alterado.
5. A construção é granular e observável: o usuário acompanha o progresso quase em tempo real (seção 10).

### Decisões do usuário

| Tema | Decisão |
| --- | --- |
| Operação | Usuário + Claude via skill dedicada a landing pages derivadas do slash-ssg |
| Organização | slash (reativa), slash-ssg (template-base), slash-ui (componentes), slash-cli (comandos), slash-workflow (processo); **cada um com seu repositório git** |
| Página | Código TS compondo componentes do slash-ui; conteúdo em `src/data/`; canvas de Design opcional |
| Clientes | Um repositório por cliente; a agência recebe o repo e faz o próprio deploy |
| Entrega | Repo no GitHub, **sem GitHub Actions**: toda verificação é local |
| Escopo v1 | Um template completo: **landing de vendas** |
| Conversão | WhatsApp, link de checkout com UTM, pixels (GTM, GA4, Meta, Google Ads, TikTok) com consentimento LGPD |
| Conteúdo | Agência fornece, Claude produz ou Claude complementa; origem marcada e liberada antes de publicar |
| SEO/SMO/SMM | Já embutidos nos componentes do slash-ui |
| Distribuição | Pacotes `@rrbashell/*` em repos privados da organização rrbashell, publicados no GitHub Packages |
| Processo | TDD vermelho → verde → refatorar; portões feature → develop → main; tudo local |
| Testes | Garantem design, comportamento e qualidade e **aceleram** a entrega; nunca são gargalo |
| Ritmo | Construção granular, interações curtas, progresso visível quase em tempo real |
| Legado | `@rrbashell/slash-ui` 0.8.x e `@rrbashell/slash-tools` 0.1.x atuais são removidos; tudo recomeça do zero |

### Fora da v1

Formulário de lead e variantes que dependem dele (vêm com o template de captura), templates
captura/produto/lançamento/evento, API de Conversões do Meta, painel visual, deploy automático, CI no GitHub.

## 2. Arquitetura

```
slash ← slash-ui ← projeto de landing (derivado do slash-ssg) ← criado/verificado por slash-cli
slash-ssg: template-base, intocado; o projeto de landing é cópia dele + overlay do slash-cli
slash-workflow: devDependency de todos os pacotes e projetos (processo)
```

| Pacote (pasta em `slash-meta/packages/`) | Repo git | Papel | Não conhece |
| --- | --- | --- | --- |
| `slash` | bashell-rrocha/slash (existe) | biblioteca reativa | nada acima dele |
| `slash-ssg` | bashell-rrocha/slash-ssg (existe) | template-base de aplicações de páginas estáticas | landing pages |
| `slash-ui` | rrbashell/slash-ui (privado, novo) | **só componentes de interface**, prontos para SEO, SMO e SMM | páginas, conteúdo, build |
| `slash-cli` | rrbashell/slash-cli (privado, novo) | **comandos de conveniência** (CLI) que o Claude ou o usuário executam: criar, checar, aprovar, verificar, entregar | regras internas dos componentes |
| `slash-workflow` | rrbashell/slash-workflow (privado, novo) | processo de desenvolvimento: portões, stamp, E2E por hash, merge local, orçamentos, release | produto |

A raiz `slash-meta` não é repositório; cada pasta em `packages/` é um repositório git independente.

### 2.1 Distribuição

- Pacotes `@rrbashell/slash-ui`, `@rrbashell/slash-cli` e `@rrbashell/slash-workflow` publicados no GitHub
  Packages (`https://npm.pkg.github.com`); o escopo é o dono dos repos, como o registry exige.
- Escopo resolvido pelo `bunfig.toml`:
  `[install.scopes] "@rrbashell" = { url = "https://npm.pkg.github.com", token = "$GITHUB_TOKEN" }`.
  O token (`read:packages`; `write:packages` para publicar) vem do ambiente e nunca é gravado em repo.
- Publicação local (`slash-workflow release`), sem Actions. Semver; projetos fixam versões exatas.
- Desenvolvimento local entre pacotes por `bun link`, sem publicar a cada mudança.

### 2.2 Legado

Antes de começar: inventário e remoção, com confirmação do usuário, do `@rrbashell/slash-ui` (0.8.x) e
`@rrbashell/slash-tools` (0.1.x) publicados, das cópias sem git em `/home/dev/Projetos/.worktrees/*/packages/` e
das referências na skill `ui-builder`. Projetos `client-*` que dependem deles são listados para o usuário decidir
(arquivar ou migrar depois); nada é apagado sem confirmação item a item.

## 3. slash-ui

Biblioteca de componentes de interface. Cada componente é uma função pura `(props, host) => SafeHtml` com CSS
Module próprio, sem cor literal (só tokens). Recebe props prontas (textos, `href`, imagens); não sabe de páginas,
conteúdo nem build.

### 3.1 Host

O slash-ui não importa o slash-ssg. Componentes que precisam do ambiente recebem um `UiHost`:

```ts
interface UiHost {
  picture(img: UiImage, opts?: { sizes?: string; priority?: boolean }): SafeHtml; // imagem otimizada do host
  island(name: string, props: object, inner: SafeHtml): SafeHtml;                 // ilha hidratada do host
}
```

O projeto derivado do slash-ssg implementa o `UiHost` com `image`/`Picture`/`island` do próprio `src/lib`. A galeria e
os testes do slash-ui usam um host de teste (`<img>` simples, wrapper `data-island`).

### 3.2 Tema e grid

- `Theme` tipado → CSS vars. Tokens do canvas: `bg`, `fg`, `muted`, `soft`, `line`, `ph`, `phl`, `card`, `bb`
  (fundo do botão), `bf` (texto do botão), `inp`; tons `light`, `gray`, `dark`, `accent`, `photo`.
- Tipografia (famílias, pesos, arquivos woff2 self-hosted), raio.
- Tema-base = valores do canvas, com `inp` ajustado onde o canvas reprova 3:1 (light, gray, accent).
- `checkThemeContrast(theme)`: texto ≥ 4,5:1 (`fg`, `muted`, `soft` sobre `bg`; `fg`, `muted` sobre `card`; `bf`
  sobre `bb`) e não-texto ≥ 3:1 (`inp` e `bb` sobre `bg`); aponta tom e token. Também como bin `slash-ui-check-theme`.
- Grid: container 1200 com padding 24 (1152 úteis), 12 colunas, gutter 24, span
  `calc((100% - 264px)/12*n + 24px*(n-1))`, grades de 2/3/4/6 colunas iguais; mobile 4 colunas com margem e gutter
  16. Larguras `contained` (1200), `wide` (1320), `full`. Teste de arquitetura proíbe larguras soltas.

### 3.3 Seções (landing de vendas)

Portadas do board `LpVendas` do canvas "page templates" (https://claude.ai/artifact/24Tfd3K6uzQW3aiitqH6qp), com
**todas as variantes do canvas**, exceto as que dependem de formulário (fora da v1). Comuns a todas: `tone`
(light/gray/dark/accent; `photo` automático no hero com imagem de fundo), `density` (normal/compact/spacious),
`width` (contained/wide/full). A quantidade de itens vem do conteúdo, não de variante.

| Código | Canvas | Variantes | Excluídas na v1 |
| --- | --- | --- | --- |
| `Hero` | Hero01 | media image/video/background/none · position left/center/right · ratio 6/6, 7/5, 5/7, 8/4, 4/8 · ctas 1/2 · eyebrow · proof note/rating/logos/none · height auto/fullscreen | media formulário |
| `Features` | Feat01 | columns 2/3/4 · icon top/side/number/none · card none/outline/filled · link · align left/center · header | — |
| `FeatureSplit` | Feat02 | position right/left · ratio 6/6, 5/7, 7/5 · media image/video · detail list/numbers/testimonial/none · cta link/button/none | — |
| `About` | About01 | position left/right · ratio 6/6, 7/5, 5/7 · media image/video/gallery · values · milestones row/vertical/none · numbers | — |
| `Testimonials` | Test01 | layout grid/featured/carousel/mosaic · format text/video · photo · rating · header | — |
| `Pricing` | Price01 | period toggle/monthly/once · highlight auto/none · comparison · guarantee · header | — |
| `Faq` | Faq01 | layout twoColumns/single/grid · ratio 4/8, 5/7, 6/6 · open one/many/all · search · contact | — |
| `Cta` | Cta01 | layout band/card/split · ratio 7/5, 6/6, 8/4 · action buttons/whatsapp · ctas 1/2 · contrast inverted/same · align center/left | action captura |
| `Footer` | Foot01 | layout full/simple/minimal · columns 2/3/4 · social · finalCta | newsletter |
| `WhatsappFab` | regra de UX | botão flutuante de WhatsApp | — |
| `ConsentBanner` | LGPD | banner de consentimento | — |

Sem JS quando possível: carrossel por scroll-snap, alternância de preço por CSS, FAQ por `<details>` (abertura
`one` com `name` compartilhado). Vídeo por *facade* (capa; player só no clique).

### 3.4 SEO, SMO e SMM embutidos

- **SEO:** HTML semântico (`section`, `h1` só no `Hero`, `h2`/`h3` nas demais), `alt` obrigatório no tipo,
  `width`/`height` em toda imagem, links com texto. Cada seção expõe seu fragmento schema.org:
  `Faq` → `FAQPage`, `Pricing` → `Product`/`Offer`, `Testimonials` → `Review`/`AggregateRating` (só com depoimentos
  marcados como reais pelo chamador), `Footer` → `Organization`/`LocalBusiness`.
- **Componentes de documento:** `SeoHead` (title, description, canonical, robots, Open Graph, Twitter card, favicon,
  theme-color) e `JsonLd` (junta e serializa os fragmentos).
- **SMO:** `SeoHead` exige imagem de compartilhamento com alt e gera `og:*`/`twitter:*`.
- **SMM:** `whatsappHref(number, message)`; botões de CTA com `data-track="<evento>"` e `data-track-meta`
  (seção e variante); ilha `utm` (repassa `utm_*`, `gclid`, `fbclid` aos links de checkout); `AnalyticsScripts`
  (GTM, GA4, Meta Pixel, Google Ads, TikTok) que só carrega após o aceite no `ConsentBanner`; ilha `track` com os
  eventos padrão:

| Ação | Meta | GA4 | Google Ads | TikTok |
| --- | --- | --- | --- | --- |
| Página carregada | `PageView` | `page_view` | — | `PageView` |
| Oferta visível | `ViewContent` | `view_item` | — | `ViewContent` |
| Clique WhatsApp | `Contact` | `generate_lead` | conversão (opcional) | `Contact` |
| Clique checkout | `InitiateCheckout` | `begin_checkout` | conversão | `InitiateCheckout` |

### 3.5 Galeria e helpers de teste

- **Galeria** (`bun run gallery`): página local com cada componente × variante × tom, recarregando a cada mudança.
  É onde o usuário acompanha os componentes surgindo (seção 10).
- **`@rrbashell/slash-ui/testing`:** `BREAKPOINTS = [360, 768, 1024, 1280, 1440]`, `expectOnGrid`,
  `expectNoHorizontalScroll`, `expectTouchTargets` (≥ 44 px), `expectNoA11yViolations` (axe). Usados pela galeria e
  pelos projetos de landing.

## 4. slash-cli

CLI fino de comandos de conveniência (`bunx @rrbashell/slash-cli <comando>`, bin `slash`). Não
contém componentes nem regras de layout: orquestra o que já existe (slash-ssg, slash-ui, Playwright, Lighthouse).

- **Fronteira:** o slash-cli opera **projetos** (criar, checar, aprovar, verificar, entregar). O processo de
  desenvolvimento dos **pacotes** (portões, stamp, merge, release) é do slash-workflow e não entra aqui.
- **Templates como dados:** cada template é um overlay em `templates/<nome>/` (v1: `landing-sales`) sobre um
  template-base (`slash-ssg`; depois `slash-spa`/`slash-ssr`). Template novo não exige mudar comandos.

| Comando | O que faz |
| --- | --- |
| `create <pasta> [--template landing-sales] [--github <owner/repo>] [--kit link]` | copia o slash-ssg (versão fixada) para `<pasta>`, aplica o overlay do template (seção 5), instala dependências, `git init`, hooks, commit inicial; com `--github`, cria repo privado via `gh` (sem Actions). Falha antes de escrever qualquer arquivo se a pasta existir ou faltar `bun`, `GITHUB_TOKEN` (salvo `--kit link`) ou `gh` (com `--github`); erro no meio remove a pasta |
| `gate` | portão de conteúdo do projeto (seção 5.2) + checagens de SEO |
| `approve` | lista o que exige liberação, pede confirmação e grava `content-release.json` assinado (`approvedBy` do `git config user.name`) |
| `verify [--background] [--update-baseline]` | pipeline final (seção 6) |
| `handoff` | vendoriza dependências `@rrbashell/*` em `vendor/*.tgz`, aponta o `package.json` para elas, remove o escopo do `bunfig.toml`, gera `AGENCIA.md`, roda `install` e `verify` **sem `GITHUB_TOKEN`** e faz commit |

Checagens sobre o **HTML gerado** (`verify`, valem para qualquer página derivada do slash-ssg): exatamente um `h1`;
headings sem saltos; tons de seções vizinhas diferentes (`data-tone`); `dark` só no hero e no CTA final; toda
`<img>` com `alt`, `width` e `height`; título 10–60 e descrição 50–160 caracteres; `og:image` presente; JSON-LD
válido. Cada falha aponta a seção (`data-section` e índice) e a correção esperada.

`AGENCIA.md`: como mudar tema (`src/theme.ts`), conteúdo (`src/data/`) e ordem/variantes das seções
(`src/pages/home.ts`); o que exige pedir ao fornecedor (seção ou variante nova); comandos `dev`, `verify`, `build`.

## 5. Projeto de landing (derivado do slash-ssg)

Resultado de `slash create sorriso`: o slash-ssg inteiro mais o overlay `landing-sales` do slash-cli. As páginas
de exemplo do slash-ssg (home, sobre, posts) saem; o resto do slash-ssg fica igual.

```
sorriso/
  src/ui-host.ts          UiHost implementado com image/Picture/island do src/lib
  src/theme.ts            tema do cliente (defineTheme do slash-ui)
  src/data/content.ts     conteúdo da página, com origem marcada (5.2)
  src/data/site.ts        WhatsApp, checkout, analytics, dados do negócio (SEO local)
  src/pages/home.ts       compõe as seções do slash-ui na ordem do LpVendas
  src/client.ts           registra as ilhas do slash-ui
  tests/e2e/landing.spec.ts  E2E da página com os helpers do slash-ui/testing
  content-release.json    liberações assinadas
  .githooks/pre-push      verify com cache
```

### 5.1 Página

`src/pages/home.ts` é TS comum: chama `Hero(...)`, `Features(...)`, … com props tipadas, lendo de `src/data/`. Trocar
ordem, variante ou tom é editar uma linha. Variante inexistente ou prop faltando é erro de compilação (tipos do
slash-ui).

### 5.2 Origem do conteúdo

Estende o portão que o slash-ssg já tem (`fictitious`, `pending`, placeholder), sem mudar o slash-ssg: o overlay
traz `src/data/origin.ts` com `agency(x)`, `claude(x)`, `fictitious(x)`, `pending(motivo)`. Valor sem marcador conta
como `agency`.

| Marcador | Portão |
| --- | --- |
| `agency` | passa |
| `claude` | exige liberação em `content-release.json` |
| `fictitious` | exige liberação; nunca alimenta `AggregateRating`/`Review` |
| `pending` | sempre bloqueia |

### 5.3 Entrega à agência

`slash handoff` (seção 4). A agência builda sem token nem acesso à rrbashell e pode mudar tema, conteúdo e
seções dentro do catálogo da versão entregue. Nova seção/variante ou atualização do kit é um novo `handoff`.
Privado aqui é o repositório-fonte; o JS entregue é legível.

## 6. `verify` e orçamento de 30 min

`slash verify`, na ordem, parando no primeiro erro:

1. `typecheck` e testes unitários do projeto.
2. `gate` (conteúdo e SEO de dados).
3. Build.
4. Checagens sobre o HTML gerado (seção 4).
5. Orçamento de peso: JS ≤ 15 KB gz, primeira carga ≤ 300 KB.
6. E2E Playwright, 5 projetos em paralelo (360, 768, 1024, 1280, 1440): grid, rolagem horizontal, toque ≥ 44 px,
   axe WCAG AA, nenhum pixel antes do consentimento, evento certo por CTA, UTM no checkout, regressão visual.
7. Lighthouse mobile ≥ 95 nas 4 categorias (execuções em paralelo).

- `--background`: começa assim que a página fica completa e roda enquanto o usuário revisa no `dev`; refaz só o que
  mudou (cache por hash).
- Base visual gravada na primeira execução aprovada (`--update-baseline`).
- Durante a edição só rodam typecheck e `gate` (watch do `dev`).
- Pre-push reaproveita o resultado se o *tree* não mudou desde o último verde (`.verify-stamp`, do slash-workflow).

| Etapa | Limite |
| --- | --- |
| Scaffold (`create`) | ≤ 1 min |
| Página + tema (skill) | ≤ 15 min |
| Revisão no `dev` + `approve` | ≤ 10 min |
| `verify` | ≤ 3 min, em segundo plano durante a revisão |

Na prática a página fecha em 20–25 min; as duas ou três primeiras podem levar 45–60 min. O teste E2E do
`create` + `verify` mede esses tempos e falha se passar do limite. Pedido fora do catálogo (seção ou variante nova)
não entra nos 30 min: a skill avisa no início, oferece a variante mais próxima e registra a evolução do slash-ui,
que segue o processo da seção 9.

## 7. Skill `slash-landing`

Nova skill no plugin `slash-builder` (`/home/dev/Projetos/squad-builder/plugins/slash-builder/skills/slash-landing/`),
especialista em landing pages derivadas do slash-ssg. Substitui a `ui-builder` e a `landing-page-builder`, que
dependem do legado (seção 2.2). Conhece o catálogo do slash-ui e a tabela canvas → código, as regras de UX (WhatsApp
para contato, formulário só para lead, sem estados de demonstração, alternância de tons, grid de 12 colunas) e os
comandos do slash-cli.

Fluxo de página nova:

1. Entrevista curta: cliente, oferta, preço, WhatsApp, checkout, pixels, material já fornecido.
2. `slash create`.
3. Escreve `src/theme.ts` (marca do cliente), `src/data/*` (origem marcada) e ajusta `src/pages/home.ts`; aciona o
   agente copywriter só para lacunas.
4. Sobe `bun run dev` e dispara `slash verify --background`.
5. Mostra o que o `gate` bloqueia; o usuário libera com `slash approve`.
6. Só declara pronto com o `verify` verde.
7. Commit e push; na entrega, `slash handoff` (transferência do repo é manual).

## 8. Testes

Tudo em TDD, padrão AAA, `bun test`; Playwright para E2E. Cobertura ≥ 90%, meta 100%.

### 8.1 Princípio: testes aceleram, nunca seguram

- **O peso fica no slash-ui.** A matriz completa (componente × variante × tom × breakpoint: HTML, axe, grid,
  regressão visual sobre a galeria) roda no slash-ui. O projeto de landing herda as garantias e testa só o que é
  dele: tema, conteúdo e a página montada.
- **Camadas com orçamento de tempo:**

  | Camada | Quando roda | O que cobre | Limite |
  | --- | --- | --- | --- |
  | Instantânea | editor e watch do `dev` | tipos, `gate`, contraste do tema | ≤ 2 s |
  | Rápida | `bun test` relacionado ao salvar (TDD) | unitários do que mudou | ≤ 10 s |
  | Final | `verify` uma vez por página; portões dos pacotes (seção 9) | build, peso, E2E, Lighthouse | ≤ 3 min |

  O tempo é medido (`slash-workflow timed`) e uma camada que estoura o limite falha.
- **Erros que dizem como corrigir:** toda falha aponta seção, campo ou token e a correção esperada.
- **Correção automática só quando é segura:** base visual na primeira execução aprovada, `approve` em um comando.
  O ambíguo só é reportado.
- **Sem testes frágeis:** nada de `sleep`, seletores por texto de copy ou screenshots de conteúdo variável;
  regressão visual com tolerância definida e máscara em mídia.

### 8.2 Por pacote

| Pacote | O que testar |
| --- | --- |
| slash-ui | HTML de cada componente × variante (happy-dom); tipos das props (casos que não compilam, com `@ts-expect-error` justificado); tema e contraste; fragmentos schema.org; `SeoHead`/`JsonLd`; ilhas; galeria E2E nos 5 breakpoints |
| slash-cli | cada comando; `create` em pasta temporária + `verify` do projeto gerado, com orçamento de tempo; `handoff` instalando e verificando sem `GITHUB_TOKEN`, editando tema e conteúdo; limpeza em erro |
| slash-workflow | hash de entradas, seleção de E2E, stamp, pre-push, merge, timed, release (repos git temporários) |
| projeto de landing | `ui-host`, origem do conteúdo, E2E da página |
| slash (se alterado) | validado em slash-spa, slash-ssr e slash-ssg |

## 9. slash-workflow e processo de desenvolvimento

Dois caminhos:

| Caminho | O que é | Processo | Tempo |
| --- | --- | --- | --- |
| Produzir uma página | tema + conteúdo + composição, sem componente novo | skill + `verify` (seções 6 e 7) | ≤ 30 min |
| Evoluir os pacotes | componente, variante, comando, processo | esta seção | horas a dias |

### 9.1 Ciclo TDD

1. **Vermelho:** escrever o teste (AAA) e rodá-lo para vê-lo falhar pelo motivo esperado.
2. **Verde:** o mínimo de código que o faz passar.
3. **Refatorar:** com o teste verde, melhorar (nomes, duplicação, DRY/KISS/SOLID) rodando os testes a cada mudança;
   commit; próximo teste.

### 9.2 Branches e portões

Toda `feature/*` deriva de `develop`. Antes de cada portão a branch recebe o merge do destino e os testes rodam
sobre esse resultado.

| Portão | O que roda |
| --- | --- |
| `feature/*` → `develop` | typecheck, lint, **todos** os unitários, cobertura ≥ 90%, E2E **afetados** (9.3) |
| `develop` → `main` | tudo acima + **todo** o E2E + Lighthouse (quando o pacote tiver página) |

### 9.3 E2E afetados por hash

- Hash por teste E2E sobre o que ele exercita: o arquivo do teste, os módulos alcançados pelo grafo de imports
  (declarado por teste na config), CSS e tokens, imagens-base, config do Playwright e `bun.lock`.
- Hash igual ao da última execução verde → pula; diferente → roda. Mudança global (config, lockfile, tokens-base)
  → roda tudo. Cache em `.e2e-cache.json` (fora do git), invalidado ao mudar Playwright ou navegador.

### 9.4 Só local, com trava

- Nenhuma verificação no GitHub. Merges em `develop` e `main` são locais (`slash-workflow merge <destino>`):
  atualiza a branch, roda o portão, grava `.verify-stamp` (hash do *tree* testado, fora do git), faz o merge.
- O pre-push de `develop` e `main` recusa o push sem stamp do mesmo *tree*, sem rodar os testes de novo.

### 9.5 Comandos do slash-workflow

`gate <feature|release>`, `merge <develop|main>`, `e2e --affected`, `timed <instant|fast|final> -- <cmd>`,
`install-hooks`, `pre-push`, `release <patch|minor|major>` (a partir da `main` com stamp de release: bump, tag,
`bun publish` no GitHub Packages, push). Configuração por `workflow.config.ts` em cada repo.

### 9.6 Retrospectiva por etapa

Ao fim de cada etapa do plano, antes de abrir a próxima: retrospectiva registrada no plano com
(1) o que funcionou, (2) o que travou e por quê, (3) pendências levantadas **e resolvidas** (ou movidas para uma
tarefa explícita com motivo), (4) mudanças de processo aplicadas (no plano, na memória, no slash-workflow ou na
skill), (5) métricas da etapa (tempo das camadas de teste, cobertura, duração real × estimada).

## 10. Construção granular e acompanhamento

O usuário prefere interações curtas e quer ver o progresso quase em tempo real. Por isso:

- **Etapa → tarefa → subtarefa.** Uma etapa fecha um entregável (ex.: "tema e grid do slash-ui"). Uma tarefa é uma
  unidade com teste e revisão próprios (ex.: "componente `Faq`"). Uma subtarefa é **um ciclo vermelho → verde →
  refatorar** sobre um comportamento (ex.: "`Faq` layout `single`"), de poucos minutos.
- **Cada subtarefa termina com algo observável:** um teste novo passando, um componente/variante aparecendo na
  galeria, um comando respondendo no terminal. Nada fica "invisível" por mais de uma subtarefa.
- **Commit por subtarefa** (pequeno, mensagem descritiva) e **status atualizado no plano na hora**: `[ ]` → `[x]` na
  subtarefa; tarefa e etapa mudam de ⬜ pendente → 🔄 em andamento → ✅ concluída na tabela de status do topo.
- **Uma linha ao usuário por subtarefa** concluída: o que mudou e onde ver (teste, URL da galeria, comando).
- **Galeria ao vivo:** durante as etapas do slash-ui, `bun run gallery` fica aberto (porta 4300) e recarrega a cada
  mudança; o usuário vê cada componente e variante surgir.
- **Pausa para correção:** o usuário pode interromper a qualquer momento; o ajuste entra como nova subtarefa, sem
  refazer o que já passou.
- **Fim de etapa:** portão do slash-workflow, retrospectiva (9.6) e um resumo curto com o que dá para ver/testar.

## 11. Riscos

- **Lighthouse ≥ 95 com vídeo no hero:** *facade*; se não bastar, a variante vídeo usa imagem até o clique.
- **Tempo do `verify`:** Playwright e Lighthouse em paralelo, cache por hash; orçamento testado.
- **Remoção do legado quebra projetos `client-*`:** inventário e confirmação item a item antes de apagar (2.2).
- **Nome `@rrbashell/slash-ui` já usado por versões antigas:** o pacote antigo é removido do registry antes da
  primeira publicação nova, que começa em 0.1.0; se o registry não liberar o nome, a nova série começa em 1.0.0.
- **Primeira publicação:** até lá, projetos e o slash-cli usam `--kit link` (`bun link` local).
- **Pacote privado × agência:** resolvido pelo `handoff`, testado sem token.
