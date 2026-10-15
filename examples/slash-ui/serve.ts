import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

// Serve o site de exemplo (dist/) numa porta: pasta → index.html; o resto, 404.html.
// Uso: PORT=4401 bun run ui:serve

const DIST = join(import.meta.dir, "dist");
const port = Number(process.env.PORT ?? 4401);
const TYPES: Record<string, string> = { ".webmanifest": "application/manifest+json", ".js": "text/javascript" };

const server = Bun.serve({
  port,
  fetch(req) {
    const path = join(DIST, decodeURIComponent(new URL(req.url).pathname));
    if (!path.startsWith(DIST)) return new Response("fora do site", { status: 403 });
    const file = existsSync(path) && statSync(path).isDirectory() ? join(path, "index.html") : path;
    if (!existsSync(file)) return new Response(Bun.file(join(DIST, "404.html")), { status: 404 });
    const ext = Object.keys(TYPES).find((e) => file.endsWith(e));
    return new Response(Bun.file(file), ext ? { headers: { "content-type": TYPES[ext] as string } } : undefined);
  },
});
console.log(`[ui:serve] http://localhost:${server.port}/`);
