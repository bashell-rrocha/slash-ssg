import { resolveStatic } from "@_bashell/slash-ui/host/node";
import { extname, join } from "node:path";

// Serve o site de exemplo (dist/) numa porta: pasta → index.html; codificação inválida → 400; caminho para fora do
// dist/ → 403; o resto, 404.html (resolveStatic, do kit).
// Uso: PORT=4401 bun run ui:serve

const DIST = join(import.meta.dir, "dist");
const port = Number(process.env.PORT ?? 4401);
const TYPES: Record<string, string> = { ".webmanifest": "application/manifest+json", ".js": "text/javascript" };

const server = Bun.serve({
  port,
  fetch(req) {
    const found = resolveStatic(DIST, new URL(req.url).pathname);
    if ("status" in found) {
      return found.status === 404
        ? new Response(Bun.file(join(DIST, "404.html")), {
            status: 404,
            headers: { "content-type": "text/html; charset=utf-8" },
          })
        : new Response(found.status === 400 ? "endereço inválido" : "fora do site", { status: found.status });
    }
    const type = TYPES[extname(found.file)];
    return new Response(Bun.file(found.file), type ? { headers: { "content-type": type } } : undefined);
  },
});
console.log(`[ui:serve] http://localhost:${server.port}/`);
