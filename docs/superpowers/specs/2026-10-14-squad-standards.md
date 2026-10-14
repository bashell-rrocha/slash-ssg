# slash-ssg 0.0.3 — padrões de arquitetura e conteúdo

Data: 2026-10-14. Origem: site Bashell (`bashell-landing-page`), onde as duas peças nasceram e rodam desde 2026-10-09.
Decisão do usuário (2026-10-14): o template guarda o que é estrutura de site Slash; ferramentas de squad (comparação
visual, captura, processo) ficam no plugin `squad-builder`.

## Escopo

1. **`src/architecture.test.ts`** — versão genérica das regras do site, presa à estrutura do template:
   - camadas: `components/` (e, se existirem, `atoms/`, `molecules/`, `organisms/`, `templates/` dentro dela),
     `pages/`, `islands/`; cada uma só importa o que a matriz permite; `src/lib/` (framework) é compartilhado;
   - só `pages/`, `routes.ts`, `scripts/` e `data/` importam **valores** de `src/data` (tipos podem);
   - pages não importam atoms nem molecules; ilhas não importam `src/data`;
   - nenhuma cor literal (hex, rgb, hsl) fora de `src/tokens.module.css` e `src/styles/themes/*.css`;
   - `unsafeHtml` só nos arquivos listados (lista vazia no template);
   - nenhum `@ts-ignore`, `as any`, `: any`; `@ts-expect-error` só com justificativa;
   - todo teste fora do framework (`src/lib/`, `scripts/ssg/`) segue AAA;
   - nenhum `@keyframes` em CSS module (o Bun renomeia o nome, mas não a referência em `animation`).
   Fica de fora o que é só da Bashell: `wa.me`, sprite de ícones, `core/markup.ts`.
2. **Tokens:** `src/tokens.module.css` com as cores do template (hoje literais em `styles.module.css`), importado
   pelo layout.
3. **Portão de conteúdo:** `src/data/walk.ts`, `src/data/gate.ts`, `src/data/index.ts` (`allContent`),
   `scripts/content-gate.ts`, scripts `gate` e `build:prod`. Achados: `fictitious: true`, placeholders `[...]` e
   `pending: [...]`. Fictício só passa com `content-release.json` cujo digest bate; placeholder e pending nunca.
   Os posts de exemplo do template são marcados `fictitious: true` e liberados por um `content-release.json` de
   demonstração, que o README manda apagar ao derivar um projeto.
4. README (seções novas e passo no "Criar um projeto derivado") e CHANGELOG 0.0.3.

## Fora do escopo

`visual-check`, `compare`, `processo.md` (plugin `squad-builder`); reestruturar o template em atomic design.

## Tarefas

| # | Tarefa | Verificação |
|---|---|---|
| 1 | `architecture.test.ts` (RED: cores literais do template) | `bun test src/architecture.test.ts` falha só na regra de cor |
| 2 | `tokens.module.css` + `styles.module.css` com `var(--…)` | regra de cor verde; build igual visualmente |
| 3 | walk + gate + testes AAA | `bun test src/data/` |
| 4 | `index.ts`, posts `fictitious`, `content-gate.ts` + teste, scripts, release de demonstração | `bun run gate` abre; sem o release, fecha |
| 5 | README + CHANGELOG + versão 0.0.3 | `typecheck`, `biome`, `test`, `test:e2e` verdes |
