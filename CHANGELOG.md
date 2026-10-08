# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui, seguindo [Conventional Commits](https://www.conventionalcommits.org/) e [SemVer](https://semver.org/).

## [Não lançado]

### Alterado

- Alinhado ao core seguro por padrão: `page` retorna `SafeHtml` (resultado de `view\`...\``); texto comum é sempre escapado.
- `island()` retorna `SafeHtml`; `head.extra` agora é `SafeHtml` (use `unsafeHtml(...)` só com conteúdo confiável).

## [0.0.1] — 2026-10-08

Primeira versão pública do `slash-ssg`.
