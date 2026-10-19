# Construção de landing pages estáticas com slash — design

Data: 2026-10-19 · Revisão 3 (simplificação: um repo, componentes copiados, sem pacote de processo) · Status: aguardando aprovação final do usuário

## 1. Objetivo

Produzir, com o usuário e o Claude (skill dedicada), landing pages estáticas derivadas do slash-ssg, prontas para
entregar a agências: bonitas (seções do canvas "page templates" sobre o grid de 12 colunas), com código bem escrito
(TDD, AAA, tipos) e **em no máximo 30 minutos por página**, do briefing ao push.

### Critérios de sucesso

1. Uma landing de vendas nova sai do briefing ao push em ≤ 30 min (medido na página de aceite, seção 8).
2. Cada página passa no `verify` local: Lighthouse mobile ≥ 95 (performance, acessibilidade, boas práticas, SEO),
   WCAG AA (axe sem violações, contraste dos tokens), regressão visual e grid em 5 breakpoints, orçamento de peso
   (JS ≤ 15 KB gz, primeira carga ≤ 300 KB).
3. Nenhuma página é publicada com conteúdo pendente, inventado ou escrito pelo Claude sem liberação.
4. Cobertura de testes ≥ 90% (meta 100%) em todo código novo ou alterado.
5. A construção é granular e observável: o usuário acompanha o progresso quase em tempo real (seção 11).

### Decisões do usuário

| Tema | Decisão |
| --- | --- |
| Operação | Usuário + Claude via skill dedicada a landing pages derivadas do slash-ssg |
| Organização | slash e slash-ssg intocados; **um repo novo `slash-landing`** com as pastas `ui/` (componentes), `cli/` (comandos) e `templates/` |
| Distribuição | **Sem registry**: `slash create` copia o código dos componentes para dentro do projeto (modelo shadcn) |
| Página | Código TS compondo componentes copiados de `ui/`; conteúdo em `src/data/`; canvas de Design opcional |
| Clientes | Um repositório por cliente; a agência recebe o repo e faz o próprio deploy |
| Entrega | Repo no GitHub, **sem GitHub Actions**: toda verificação é local |
| Escopo v1 | Um template completo: **landing de vendas**; cada seção com a variante do `LpVendas`, demais sob demanda |
| Conversão | WhatsApp, link de checkout com UTM, **só Google Tag Manager** (Consent Mode v2) com consentimento LGPD |
| Conteúdo | Agência fornece, Claude produz ou Claude complementa; origem marcada e liberada antes de publicar |
| SEO/SMO | Já embutidos nos componentes |
| Processo | TDD vermelho → verde → refatorar; `feature/*` → `main` com um portão local (`bun run gate`) |
| Testes | Garantem design, comportamento e qualidade e **aceleram** a entrega; nunca são gargalo |
| Ritmo | Construção granular, interações curtas, progresso visível quase em tempo real |
| Legado | `@rrbashell/slash-ui` 0.8.x e `@rrbashell/slash-tools` 0.1.x atuais são removidos; tudo recomeça do zero |

### Fora da v1

Formulário de lead e variantes que dependem dele (vêm com o template de captura), templates
captura/produto/lançamento/evento, variantes do canvas além das usadas no `LpVendas` (entram sob demanda, seção 3.3),
pixels diretos fora do GTM, API de Conversões do Meta, painel visual, deploy automático, CI no GitHub, publicação
em registry, seleção de E2E por hash.

## 2. Arquitetura

```
slash ← slash-ssg ← projeto de landing  (cópia do slash-ssg + overlay do template + cópia de ui/)
                      ↑ criado e verificado pelo bin `slash` (cli/ do slash-landing)
```

| Pasta em `slash-meta/packages/` | Repo git | Papel |
| --- | --- | --- |
| `slash` | bashell-rrocha/slash (existe) | biblioteca reativa, intocada |
| `slash-ssg` | bashell-rrocha/slash-ssg (existe) | template-base de páginas estáticas, intocado |
| `slash-landing` | rrbashell/slash-landing (privado, novo) | componentes, galeria, CLI e templates |

Pastas do `slash-landing`:

| Pasta | Papel | Não conhece |
| --- | --- | --- |
| `ui/` | **só componentes de interface**, prontos para SEO e SMO; galeria; helpers de teste | `cli/`, páginas, conteúdo, build |
| `cli/` | bin `slash`: criar, checar, aprovar, verificar projetos | regras internas dos componentes |
| `templates/landing-sales/` | overlay aplicado sobre o slash-ssg (dados, não código do CLI) | — |

Um teste de arquitetura impede `ui/` de importar `cli/` ou `templates/`. Se outro template-base (slash-spa,
slash-ssr) precisar de `ui/`, ela é extraída para um repo próprio nesse momento.

### 2.1 Instalação e versão

- O usuário roda `bun link` no `slash-landing`; o bin `slash` fica disponível na máquina.
- A versão dos componentes é a tag do `slash-landing` (semver, `git tag`). `slash create` grava em
  `src/ui/VERSION` a tag e o commit copiados.
- Um projeto não recebe atualização automática de componentes: a entrega à agência é congelada. Atualizar um
  projeto é recopiar `ui/` de propósito (comando futuro, fora da v1).

### 2.2 Legado

Antes de começar: inventário e remoção, com confirmação do usuário, do `@rrbashell/slash-ui` (0.8.x) e
`@rrbashell/slash-tools` (0.1.x) publicados, das cópias sem git em `/home/dev/Projetos/.worktrees/*/packages/` e
das referências na skill `ui-builder`. Projetos `client-*` que dependem deles são listados para o usuário decidir
(arquivar ou migrar depois); nada é apagado sem confirmação item a item.

## 3. Componentes (`ui/`)

Cada componente é uma função pura `(props, host) => SafeHtml` com CSS Module próprio, sem cor literal (só tokens).
Recebe props prontas (textos, `href`, imagens); não sabe de páginas, conteúdo nem build.

### 3.1 Host

`ui/` não importa o slash-ssg. Componentes que precisam do ambiente recebem um `UiHost`:

```ts
interface UiHost {
  picture(img: UiImage, opts?: { sizes?: string; priority?: boolean }): SafeHtml; // imagem otimizada do host
  island(name: string, props: object, inner: SafeHtml): SafeHtml;                 // ilha hidratada do host
}
```

O projeto implementa o `UiHost` com `image`/`Picture`/`island` do próprio `src/lib`. A galeria e os testes de `ui/`
usam um host de teste (`<img>` simples, wrapper `data-island`).

### 3.2 Tema e grid

- `Theme` tipado → CSS vars. Tokens do canvas: `bg`, `fg`, `muted`, `soft`, `line`, `ph`, `phl`, `card`, `bb`
  (fundo do botão), `bf` (texto do botão), `inp`; tons `light`, `gray`, `dark`, `accent`, `photo`.
- Tipografia (famílias, pesos, arquivos woff2 self-hosted), raio.
- Tema-base = valores do canvas, com `inp` ajustado onde o canvas reprova 3:1 (light, gray, accent).
- `checkThemeContrast(theme)` (função de `ui/`; quem a executa no projeto é o `slash check`): texto ≥ 4,5:1 (`fg`,
  `muted`, `soft` sobre `bg`; `fg`, `muted` sobre `card`; `bf` sobre `bb`) e não-texto ≥ 3:1 (`inp` e `bb` sobre
  `bg`); aponta tom e token.
- Grid: container 1200 com padding 24 (1152 úteis), 12 colunas, gutter 24, span
  `calc((100% - 264px)/12*n + 24px*(n-1))`, grades de 2/3/4/6 colunas iguais; mobile 4 colunas com margem e gutter
  16. Larguras `contained` (1200), `wide` (1320), `full`. Teste de arquitetura proíbe larguras soltas.

### 3.3 Seções (landing de vendas)

Portadas do board `LpVendas` do canvas "page templates" (https://claude.ai/artifact/24Tfd3K6uzQW3aiitqH6qp).
Comuns a todas: `tone` (light/gray/dark/accent; `photo` automático no hero com imagem de fundo), `density`
(normal/compact/spacious), `width` (contained/wide/full). A quantidade de itens vem do conteúdo, não de variante.

**v1 = a variante que o `LpVendas` usa em cada seção.** As demais variantes do canvas formam o catálogo sob demanda:
entram quando uma página real pedir, pelo processo da seção 10, cada uma como subtarefa TDD própria.

| Código | Canvas | Catálogo sob demanda (variantes do canvas) | Nunca na v1 |
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

A primeira tarefa da etapa de seções lê o `LpVendas` no canvas e fixa no plano a variante v1 de cada seção.

Sem JS quando possível: carrossel por scroll-snap, alternância de preço por CSS, FAQ por `<details>` (abertura
`one` com `name` compartilhado). Vídeo por *facade* (capa; player só no clique).

### 3.4 SEO, SMO e medição embutidos

- **SEO:** HTML semântico (`section`, `h1` só no `Hero`, `h2`/`h3` nas demais), `alt` obrigatório no tipo,
  `width`/`height` em toda imagem, links com texto. Cada seção expõe seu fragmento schema.org:
  `Faq` → `FAQPage`, `Pricing` → `Product`/`Offer`, `Testimonials` → `Review`/`AggregateRating` (só com depoimentos
  marcados como reais pelo chamador), `Footer` → `Organization`/`LocalBusiness`.
- **Componentes de documento:** `SeoHead` (title, description, canonical, robots, Open Graph, Twitter card, favicon,
  theme-color) e `JsonLd` (junta e serializa os fragmentos).
- **SMO:** `SeoHead` exige imagem de compartilhamento com alt e gera `og:*`/`twitter:*`.
- **Medição:** `whatsappHref(number, message)`; botões de CTA com `data-track="<evento>"` e `data-track-meta`
  (seção e variante); ilha `utm` (repassa `utm_*`, `gclid`, `fbclid` aos links de checkout); `Gtm` carrega o Google
  Tag Manager com Consent Mode v2 (tudo negado até o aceite no `ConsentBanner`); ilha `track` empurra no
  `dataLayer` os eventos padrão. GA4, Meta, Google Ads e TikTok são configurados pela agência dentro do GTM.

| Ação | Evento no `dataLayer` |
| --- | --- |
| Oferta visível | `view_item` |
| Clique WhatsApp | `generate_lead` (`method: "whatsapp"`) |
| Clique checkout | `begin_checkout` |

(`page_view` fica a cargo do próprio GTM.)

### 3.5 Galeria e helpers de teste

- **Galeria** (`bun run gallery`, porta 4300): página local com cada componente × variante × tom, recarregando a
  cada mudança. É onde o usuário acompanha os componentes surgindo (seção 11).
- **`ui/testing`** (copiado para o projeto junto com `ui/`): `BREAKPOINTS = [360, 768, 1024, 1280, 1440]`,
  `expectOnGrid`, `expectNoHorizontalScroll`, `expectTouchTargets` (≥ 44 px), `expectNoA11yViolations` (axe).

## 4. CLI (`cli/`, bin `slash`)

CLI fino de comandos de conveniência. Não contém componentes nem regras de layout: orquestra o que já existe
(slash-ssg, `ui/`, Playwright, Lighthouse). Opera **projetos**; o processo de desenvolvimento do próprio
`slash-landing` é a seção 10.

**Templates como dados:** cada template é um overlay em `templates/<nome>/` (v1: `landing-sales`) sobre um
template-base (`slash-ssg`). Template novo não exige mudar comandos.

| Comando | O que faz |
| --- | --- |
| `create <pasta> [--template landing-sales] [--github <owner/repo>]` | clona o slash-ssg na tag fixada em `cli/config.ts` para `<pasta>`, aplica o overlay do template (seção 5), copia `ui/` para `src/ui/` (com `VERSION`), instala dependências, `git init`, hook de pre-push, commit inicial; com `--github`, cria repo privado via `gh` (sem Actions). Falha antes de escrever qualquer arquivo se a pasta existir ou faltar `bun`, `git` ou `gh` (com `--github`); erro no meio remove a pasta |
| `check` | conteúdo (seção 5.2), contraste do tema (`checkThemeContrast`) e SEO dos dados |
| `approve` | lista o que exige liberação, pede confirmação e grava `content-release.json` assinado (`approvedBy` do `git config user.name`) |
| `verify [--background] [--update-baseline]` | pipeline final (seção 6) |

Checagens sobre o **HTML gerado** (`verify`): exatamente um `h1`; headings sem saltos; tons de seções vizinhas
diferentes (`data-tone`); `dark` só no hero e no CTA final; toda `<img>` com `alt`, `width` e `height`; título 10–60
e descrição 50–160 caracteres; `og:image` presente; JSON-LD válido. Cada falha aponta a seção (`data-section` e
índice) e a correção esperada.

## 5. Projeto de landing (derivado do slash-ssg)

Resultado de `slash create sorriso`: o slash-ssg inteiro, o overlay `landing-sales` e a cópia de `ui/`. As páginas
de exemplo do slash-ssg (home, sobre, posts) saem; o resto do slash-ssg fica igual. O projeto não depende de nenhum
pacote privado: builda com `bun install` puro.

```
sorriso/
  src/ui/                 cópia dos componentes (VERSION com tag e commit)
  src/ui-host.ts          UiHost implementado com image/Picture/island do src/lib
  src/theme.ts            tema do cliente (defineTheme de src/ui)
  src/data/content.ts     conteúdo da página, com origem marcada (5.2)
  src/data/site.ts        WhatsApp, checkout, GTM, dados do negócio (SEO local)
  src/data/origin.ts      marcadores de origem
  src/pages/home.ts       compõe as seções na ordem do LpVendas
  src/client.ts           registra as ilhas
  tests/e2e/landing.spec.ts  E2E da página com os helpers de src/ui/testing
  content-release.json    liberações assinadas
  AGENCIA.md              guia da agência
  .githooks/pre-push      `slash verify` (pula se o tree não mudou desde o último verde)
```

### 5.1 Página

`src/pages/home.ts` é TS comum: chama `Hero(...)`, `Features(...)`, … com props tipadas, lendo de `src/data/`. Trocar
ordem, variante ou tom é editar uma linha. Variante inexistente ou prop faltando é erro de compilação.

### 5.2 Origem do conteúdo

Estende o portão que o slash-ssg já tem (`fictitious`, `pending`, placeholder), sem mudar o slash-ssg: o overlay
traz `src/data/origin.ts` com `agency(x)`, `claude(x)`, `fictitious(x)`, `pending(motivo)`. Valor sem marcador conta
como `agency`.

| Marcador | `check` |
| --- | --- |
| `agency` | passa |
| `claude` | exige liberação em `content-release.json` |
| `fictitious` | exige liberação; nunca alimenta `AggregateRating`/`Review` |
| `pending` | sempre bloqueia |

### 5.3 Entrega à agência

O repo do projeto já é a entrega: builda sem token nem acesso à rrbashell. `AGENCIA.md` (vem do overlay) explica
como mudar tema (`src/theme.ts`), conteúdo (`src/data/`) e ordem/variantes das seções (`src/pages/home.ts`); o que
exige pedir ao fornecedor (seção ou variante nova); comandos `dev`, `verify`, `build`. Transferência do repo é
manual. Privado aqui é o `slash-landing`; o código entregue é legível.

## 6. `verify` e orçamento de 30 min

`slash verify`, na ordem, parando no primeiro erro:

1. `typecheck` e testes unitários do projeto.
2. `check` (conteúdo, contraste e SEO de dados).
3. Build.
4. Checagens sobre o HTML gerado (seção 4).
5. Orçamento de peso: JS ≤ 15 KB gz, primeira carga ≤ 300 KB.
6. E2E Playwright, 5 projetos em paralelo (360, 768, 1024, 1280, 1440): grid, rolagem horizontal, toque ≥ 44 px,
   axe WCAG AA, GTM sem consentimento concedido antes do aceite, evento certo no `dataLayer` por CTA, UTM no
   checkout, regressão visual.
7. Lighthouse mobile ≥ 95 nas 4 categorias.

- `--background`: começa assim que a página fica completa e roda enquanto o usuário revisa no `dev`.
- Base visual gravada na primeira execução aprovada (`--update-baseline`).
- Durante a edição só rodam typecheck e `check` (watch do `dev`).
- Último verde grava `.verify-stamp` (hash do *tree*, fora do git); o pre-push pula o `verify` se o *tree* for o
  mesmo.

| Etapa | Limite |
| --- | --- |
| Scaffold (`create`) | ≤ 1 min |
| Página + tema (skill) | ≤ 15 min |
| Revisão no `dev` + `approve` | ≤ 10 min |
| `verify` | ≤ 3 min, em segundo plano durante a revisão |

Na prática a página fecha em 20–25 min; as duas ou três primeiras podem levar 45–60 min. O E2E do `cli/` mede
`create` + `verify` e falha se passar do limite. Pedido fora do catálogo (seção ou variante nova) não entra nos
30 min: a skill avisa no início, oferece a variante mais próxima e registra a evolução de `ui/`, que segue a
seção 10.

## 7. Skill `slash-landing`

Nova skill no plugin `slash-builder` (`/home/dev/Projetos/squad-builder/plugins/slash-builder/skills/slash-landing/`),
especialista em landing pages derivadas do slash-ssg. Substitui a `ui-builder` e a `landing-page-builder`, que
dependem do legado (seção 2.2). Conhece o catálogo de `ui/` e a tabela canvas → código, as regras de UX (WhatsApp
para contato, formulário só para lead, sem estados de demonstração, alternância de tons, grid de 12 colunas), os
comandos `slash` e o processo da seção 10.

Fluxo de página nova:

1. Entrevista curta: cliente, oferta, preço, WhatsApp, checkout, ID do GTM, material já fornecido.
2. `slash create`.
3. Escreve `src/theme.ts` (marca do cliente), `src/data/*` (origem marcada) e ajusta `src/pages/home.ts`; aciona o
   agente copywriter só para lacunas.
4. Sobe `bun run dev` e dispara `slash verify --background`.
5. Mostra o que o `check` bloqueia; o usuário libera com `slash approve`.
6. Só declara pronto com o `verify` verde.
7. Commit e push.

A skill anota o horário de início e fim de cada passo em `.slash/timeline.json` do projeto (fora do git) e mostra o
total ao final.

## 8. Página de aceite cronometrada

Última etapa do plano: o usuário e o Claude produzem, com a skill, uma landing de vendas completa para um cliente
de exemplo (conteúdo marcado `fictitious`, liberado com `approve`), do briefing ao push, com cronômetro
(`.slash/timeline.json`). Aceite quando: `verify` verde, total ≤ 30 min e nenhum passo acima do limite da seção 6.
O resultado (tempos por passo e o que atrasou) entra na retrospectiva da etapa. Se estourar, as causas viram
tarefas e a página de aceite é refeita.

## 9. Testes

Tudo em TDD, padrão AAA, `bun test`; Playwright para E2E. Cobertura ≥ 90%, meta 100%.

### 9.1 Princípio: testes aceleram, nunca seguram

- **O peso fica em `ui/`.** A matriz (componente × variante × tom × breakpoint: HTML, axe, grid, regressão visual
  sobre a galeria) roda no `slash-landing`. O projeto de landing herda as garantias e testa só o que é dele: tema,
  conteúdo e a página montada.
- **Camadas com metas de tempo:**

  | Camada | Quando roda | O que cobre | Meta |
  | --- | --- | --- | --- |
  | Instantânea | editor e watch do `dev` | tipos, `check` | ≤ 2 s |
  | Rápida | `bun test` relacionado ao salvar (TDD) | unitários do que mudou | ≤ 10 s |
  | Final | `verify` uma vez por página; `bun run gate` no `slash-landing` | build, peso, E2E, Lighthouse | ≤ 3 min |

  O `bun run gate` imprime a duração de cada camada; estouro vira item da retrospectiva.
- **Erros que dizem como corrigir:** toda falha aponta seção, campo ou token e a correção esperada.
- **Correção automática só quando é segura:** base visual na primeira execução aprovada, `approve` em um comando.
  O ambíguo só é reportado.
- **Sem testes frágeis:** nada de `sleep`, seletores por texto de copy ou screenshots de conteúdo variável;
  regressão visual com tolerância definida e máscara em mídia.

### 9.2 Por parte

| Parte | O que testar |
| --- | --- |
| `ui/` | HTML de cada componente × variante (happy-dom); tipos das props (casos que não compilam, com `@ts-expect-error` justificado); tema e contraste; fragmentos schema.org; `SeoHead`/`JsonLd`; `Gtm` e ilhas; arquitetura (sem import de `cli/`, sem larguras soltas, sem cor literal); galeria E2E nos 5 breakpoints |
| `cli/` | cada comando; `create` em pasta temporária + `verify` do projeto gerado, com orçamento de tempo; projeto gerado instalando e buildando sem token; limpeza em erro |
| projeto de landing | `ui-host`, origem do conteúdo, E2E da página |
| slash (se alterado) | validado em slash-spa, slash-ssr e slash-ssg |

## 10. Processo de desenvolvimento do `slash-landing`

Dois caminhos:

| Caminho | O que é | Processo | Tempo |
| --- | --- | --- | --- |
| Produzir uma página | tema + conteúdo + composição, sem componente novo | skill + `verify` (seções 6 e 7) | ≤ 30 min |
| Evoluir o `slash-landing` | componente, variante, comando | esta seção | horas a dias |

### 10.1 Ciclo TDD

1. **Vermelho:** escrever o teste (AAA) e rodá-lo para vê-lo falhar pelo motivo esperado.
2. **Verde:** o mínimo de código que o faz passar.
3. **Refatorar:** com o teste verde, melhorar (nomes, duplicação, DRY/KISS/SOLID) rodando os testes a cada mudança;
   commit; próximo teste.

### 10.2 Branches e portão

- `feature/*` a partir de `main`. Antes do merge, a branch recebe o merge da `main` e o portão roda sobre o
  resultado.
- **Portão único** `bun run gate`: typecheck, lint, todos os unitários, cobertura ≥ 90%, todo o E2E (galeria e
  `cli/`).
- Merge local na `main` só com o portão verde; hook de pre-push na `main` roda o mesmo portão.
- Release: `git tag vX.Y.Z` na `main` com portão verde. Nenhuma verificação no GitHub.

### 10.3 Retrospectiva por etapa

Ao fim de cada etapa do plano, antes de abrir a próxima: retrospectiva registrada no plano com
(1) o que funcionou, (2) o que travou e por quê, (3) pendências levantadas **e resolvidas** (ou movidas para uma
tarefa explícita com motivo), (4) mudanças de processo aplicadas (no plano, na memória ou na skill), (5) métricas
da etapa (tempo das camadas de teste, cobertura, duração real × estimada).

## 11. Construção granular e acompanhamento

O usuário prefere interações curtas e quer ver o progresso quase em tempo real. Por isso:

- **Etapa → tarefa → subtarefa.** Uma etapa fecha um entregável (ex.: "tema e grid"). Uma tarefa é uma unidade com
  teste e revisão próprios (ex.: "componente `Faq`"). Uma subtarefa é **um ciclo vermelho → verde → refatorar**
  sobre um comportamento (ex.: "`Faq` abre um item por vez"), de poucos minutos.
- **Cada subtarefa termina com algo observável:** um teste novo passando, um componente/variante aparecendo na
  galeria, um comando respondendo no terminal. Nada fica "invisível" por mais de uma subtarefa.
- **Commit por subtarefa** (pequeno, mensagem descritiva) e **status atualizado no plano na hora**: `[ ]` → `[x]` na
  subtarefa; tarefa e etapa mudam de ⬜ pendente → 🔄 em andamento → ✅ concluída na tabela de status do topo.
- **Uma linha ao usuário por subtarefa** concluída: o que mudou e onde ver (teste, URL da galeria, comando).
- **Galeria ao vivo:** durante as etapas de `ui/`, `bun run gallery` fica aberto (porta 4300) e recarrega a cada
  mudança.
- **Pausa para correção:** o usuário pode interromper a qualquer momento; o ajuste entra como nova subtarefa, sem
  refazer o que já passou.
- **Fim de etapa:** portão, retrospectiva (10.3) e um resumo curto com o que dá para ver/testar.

## 12. Riscos

- **Lighthouse ≥ 95 com vídeo no hero:** *facade*; se não bastar, a variante vídeo usa imagem até o clique.
- **Lighthouse ≥ 95 com GTM:** GTM só carrega após interação ou aceite; container vazio no teste.
- **Tempo do `verify`:** Playwright e Lighthouse em paralelo; orçamento testado no E2E do `cli/`.
- **Remoção do legado quebra projetos `client-*`:** inventário e confirmação item a item antes de apagar (2.2).
- **Projetos com cópias divergentes de `ui/`:** aceito; `VERSION` registra a origem e cada entrega é congelada.
- **Catálogo pequeno na v1:** a primeira páginas reais podem pedir variantes; o caminho sob demanda (3.3) é
  previsto e fica fora dos 30 min.
- **Acesso ao slash-ssg no `create`:** clone da tag fixada; sem rede, usa o clone local em `slash-meta/packages/`.
