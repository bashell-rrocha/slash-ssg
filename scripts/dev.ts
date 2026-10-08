import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { site } from "../src/site";
import { createBuildQueue } from "./ssg/build-queue";
import { startServer } from "./ssg/serve";
import { parsePort } from "./ssg/serve-core";

const ROOT = resolve(import.meta.dir, "..");
const DIST = resolve(ROOT, "dist");
const WATCHED = [resolve(ROOT, "src"), resolve(ROOT, "public")];

let PORT: number;
try {
  PORT = parsePort(process.env.PORT);
} catch (err) {
  console.error(`[dev] ${(err as Error).message}`);
  process.exit(1);
}

let lastError: string | null = null;
let server: ReturnType<typeof startServer>;
try {
  server = startServer({ dist: DIST, port: PORT, dev: true, getError: () => lastError, lang: site.lang });
} catch (err) {
  if ((err as { code?: string }).code === "EADDRINUSE") {
    console.error(`[dev] A porta ${PORT} já está em uso. Tente outra porta: PORT=${PORT + 1} bun run dev`);
    process.exit(1);
  }
  throw err;
}

// Cada build roda em subprocesso para o cache de módulos do Bun não servir versões antigas das páginas.
const queue = createBuildQueue(async () => {
  const proc = Bun.spawn(["bun", "run", "scripts/build.ts", "--dev"], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "pipe",
  });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (code === 0) {
    lastError = null;
    if (stderr) process.stderr.write(stderr);
  } else {
    lastError = stderr || `O build terminou com código ${code}`;
    console.error(lastError);
  }
  server.broadcastReload();
});

queue.trigger();
await queue.idle();
console.log(`[dev] http://localhost:${PORT} (observando src/ e public/)`);

// Observação por polling de mtimes (fs.watch recursivo não é confiável no Linux, como no slash-ssr).
async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (!e.name.endsWith(".d.ts")) yield full;
  }
}

async function snapshot(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const dir of WATCHED) {
    for await (const file of walk(dir)) {
      try {
        map.set(file, (await stat(file)).mtimeMs);
      } catch {}
    }
  }
  return map;
}

let known = await snapshot();
let debounce: ReturnType<typeof setTimeout> | undefined;
const schedule = () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => queue.trigger(), 100);
};

const interval = setInterval(async () => {
  const current = await snapshot();
  let changed = current.size !== known.size;
  if (!changed) for (const [f, m] of current) if (known.get(f) !== m) changed = true;
  known = current;
  if (changed) schedule();
}, 300);

const shutdown = () => {
  clearInterval(interval);
  server.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
