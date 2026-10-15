# Hospedeiro de exemplo do slash-ui (slash-ssg)

As telas de exemplo do `@_bashell/slash-ui` montadas com o pipeline deste template: as 4 landings e o app Sereno
(cada estado e cada lembrete), como PWA. É a prova de nível 3 do kit: as mesmas páginas rodam iguais em slash-ssg,
slash-spa e slash-ssr (`bun run test:hosts` no `slash-ui`).

- `bun run ui:build`: gera `examples/slash-ui/dist/` (páginas, CSS dos temas com as fontes, ícones, manifest e
  service worker do app).
- `PORT=4401 bun run ui:serve`: serve o `dist/`.

O site vem de `@_bashell/slash-ui/host` (`exampleSite`, `headLinks`, `renderPage`); o prerender usa
`renderRoutes` do template com as rotas daqui. Nada aqui muda o site de demonstração do template.
