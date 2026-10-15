# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui, seguindo [Conventional Commits](https://www.conventionalcommits.org/) e [SemVer](https://semver.org/).

## [0.0.5] — 2026-10-15

### Adicionado

- `bun.lock` versionado (gerado fora do monorepo) e `bun install --frozen-lockfile` na pipeline; o README explica como
  regerar. Relatório do Playwright guardado quando a pipeline falha.

### Alterado

- `@types/bun` fixo (1.4.3), não mais `latest`.

### Removido

- `paths` do `tsconfig.json` que apontavam `@_bashell/slash` para `../slash/src`: num projeto criado do template com
  uma pasta `../slash` ao lado, o build usaria esse código em silêncio. O core vem sempre do pacote instalado.
- `docs/superpowers/` (planos e specs antigos do desenvolvimento no monorepo).

## [0.0.4] — 2026-10-15

Compatível com `@_bashell/slash` 0.0.6 (npm). O template roda fora do monorepo `slash-meta` só com o core publicado.

### Adicionado

- Pipeline de testes no GitHub Actions (`.github/workflows/test.yml`): em todo PR para `develop` ou `main` e no push na
  `main`, `bun install`, `test`, `typecheck` e `test:e2e`.
- `Head.htmlAttrs` (atributos do `<html>`, ex.: tema e modo) e `Head.exactTitle` (título sem o sufixo do site).
- `renderRoutes` em `src/lib/prerender-core.ts`: o prerender de um conjunto de rotas, reutilizável por outros sites.
- O teste do framework (`scripts/ssg/build-site.test.ts`) usa uma fixture própria (`scripts/ssg/__fixtures__/site/`)
  sobre `src/lib`: trocar ou tirar a demo de `src/` não quebra o teste. `fixture-typecheck.test.ts` passa a fixture
  pelo `tsc`.

### Alterado

- `@_bashell/slash` pela versão publicada (`^0.0.6`), não mais `workspace:*`.
- README: "Criar um projeto derivado" pelo template do GitHub (`bun install` direto) e "Testes no GitHub".

### Removido

- `bunfig.toml` com alias para um caminho da máquina de desenvolvimento (nada o usava).

## [0.0.3] — 2026-10-14

### Adicionado

- `src/architecture.test.ts`: regras de camadas, imports de `src/data`, cores literais (hex, funções de cor e cores
  nomeadas), `unsafeHtml`, tipagem (`any`, `@ts-ignore`, `@ts-nocheck`), testes AAA, `@keyframes` em CSS module e
  registro de todo arquivo de dados em `allContent`, ajustáveis pelas constantes do topo do arquivo.
- Portão de conteúdo: `src/data/gate.ts`, `src/data/walk.ts`, `src/data/index.ts` (`allContent`),
  `scripts/content-gate.ts`, scripts `gate` e `build:prod`, e `content-release.json` de demonstração (apague ao derivar
  um projeto). Link markdown `[texto](url)` não conta como placeholder.
- `src/tokens.module.css`: única fonte de cor do template.

### Alterado

- `styles.module.css` usa `var(--color-…)`; os posts de exemplo são marcados `fictitious: true`.

## [0.0.2] — 2026-10-08

Compatível com `@_bashell/slash` 0.0.3 (seguro por padrão).

### Alterado

- Alinhado ao core seguro por padrão: `page` retorna `SafeHtml` (resultado de `view\`...\``); texto comum é sempre escapado.
- README: nova seção "HTML seguro"; comentários das ilhas corrigidos (sem `reactiveView` a ilha renderiza uma vez e não reage).
- `island()` retorna `SafeHtml`; `head.extra` agora é `SafeHtml` (use `unsafeHtml(...)` só com conteúdo confiável).

## [0.0.1] — 2026-10-08

Primeira versão pública do `slash-ssg`.
