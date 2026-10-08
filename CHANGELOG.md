# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui, seguindo [Conventional Commits](https://www.conventionalcommits.org/) e [SemVer](https://semver.org/).

## [0.0.2] — 2026-10-08

Compatível com `@_bashell/slash` 0.0.3 (seguro por padrão).

### Alterado

- Alinhado ao core seguro por padrão: `page` retorna `SafeHtml` (resultado de `view\`...\``); texto comum é sempre escapado.
- README: nova seção "HTML seguro"; comentários das ilhas corrigidos (sem `reactiveView` a ilha renderiza uma vez e não reage).
- `island()` retorna `SafeHtml`; `head.extra` agora é `SafeHtml` (use `unsafeHtml(...)` só com conteúdo confiável).

## [0.0.1] — 2026-10-08

Primeira versão pública do `slash-ssg`.
