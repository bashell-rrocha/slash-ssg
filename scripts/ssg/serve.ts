import { statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { renderErrorPage, resolveRequest } from "./serve-core";

const DIST_WAIT_MS = 500;
const DIST_POLL_MS = 25;
const DEV_BUFFER_MAX = 1024 * 1024; // no dev, só arquivos até 1 MB são lidos para memória

export type ServerOptions = {
  dist: string;
  port: number;
  dev: boolean;
  getError?: () => string | null;
  lang?: string; // idioma da página de erro do dev
};

// Servidor estático de dist/. Em dev expõe /__reload (SSE) e troca respostas HTML pela página de erro
// enquanto o último build estiver falho.
export function startServer(opts: ServerOptions): { port: number; broadcastReload(): void; stop(): void } {
  const dist = resolve(opts.dist);
  const encoder = new TextEncoder();
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

  const isFile = (rel: string): boolean => {
    const full = resolve(join(dist, rel));
    if (!full.startsWith(dist + sep)) return false;
    try {
      return statSync(full).isFile();
    } catch {
      return false;
    }
  };

  const distExists = (): boolean => {
    try {
      return statSync(dist).isDirectory();
    } catch {
      return false;
    }
  };

  // Durante a troca de dist/ de um rebuild (dois renames) o diretório some por instantes. No dev, as
  // respostas esperam (no máximo DIST_WAIT_MS, em passos de DIST_POLL_MS) por ele antes de dar 404.
  const waitForDist = async (): Promise<void> => {
    for (let waited = 0; !distExists() && waited < DIST_WAIT_MS; waited += DIST_POLL_MS) await Bun.sleep(DIST_POLL_MS);
  };

  const readFile = async (rel: string, status: number, headers: Record<string, string>): Promise<Response> => {
    const file = Bun.file(join(dist, rel));
    if (!opts.dev) return new Response(file, { status, headers });
    // Arquivos grandes (imagens, vídeos) seguem em stream como no preview: a corrida da troca de dist/ importa
    // para HTML/CSS/JS, que são pequenos. Um ENOENT do stat também cai no tratamento de retry.
    if (statSync(join(dist, rel)).size > DEV_BUFFER_MAX) return new Response(file, { status, headers });
    // Lê aqui (e não no stream da resposta) para um ENOENT da troca de dist/ ser tratável
    const bytes = await file.bytes();
    return new Response(bytes, { status, headers: { ...headers, "content-type": file.type } });
  };

  const respond = async (url: URL, retried: boolean): Promise<Response> => {
    // Um 404 (ou ENOENT na leitura) com dist/ ausente é a janela da troca: espera e tenta uma vez mais
    const retry = async (): Promise<Response | null> => {
      if (!opts.dev || retried || distExists()) return null;
      await waitForDist();
      return respond(url, true);
    };
    if (opts.dev && !retried) await waitForDist();
    const resolved = resolveRequest(url, isFile);
    // Em dev o redirect é 302 para o navegador não cachear /x -> /x/ (301 só no preview)
    if (resolved.kind === "redirect") {
      return Response.redirect(new URL(resolved.location, url).href, opts.dev ? 302 : 301);
    }

    const headers: Record<string, string> = opts.dev ? { "cache-control": "no-store" } : {};
    const error = opts.dev ? opts.getError?.() : null;
    if (error && resolved.file.endsWith(".html")) {
      return new Response(renderErrorPage(error, opts.lang), {
        status: 500,
        headers: { ...headers, "content-type": "text/html; charset=utf-8" },
      });
    }
    if (!isFile(resolved.file)) {
      return (await retry()) ?? new Response("Not found", { status: 404, headers });
    }
    try {
      return await readFile(resolved.file, resolved.status, headers);
    } catch (err) {
      if ((err as { code?: string }).code !== "ENOENT") throw err;
      return (await retry()) ?? new Response("Not found", { status: 404, headers });
    }
  };

  const server = Bun.serve({
    port: opts.port,
    // O SSE do dev precisa de conexão aberta sem limite; o preview mantém o timeout padrão do Bun
    ...(opts.dev ? { idleTimeout: 0 } : {}),
    async fetch(req) {
      const url = new URL(req.url);

      if (opts.dev && url.pathname === "/__reload") {
        let ctrl: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            ctrl = c;
            clients.add(c);
            c.enqueue(encoder.encode(": conectado\n\n"));
          },
          cancel() {
            clients.delete(ctrl);
          },
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        });
      }

      return respond(url, false);
    },
  });

  // Comentário SSE periódico mantém a conexão viva através de proxies e evita reconexões perdidas.
  const ping = opts.dev
    ? setInterval(() => {
        for (const c of clients) {
          try {
            c.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            clients.delete(c);
          }
        }
      }, 5000)
    : null;

  return {
    port: server.port as number,
    broadcastReload() {
      for (const c of clients) {
        try {
          c.enqueue(encoder.encode("data: reload\n\n"));
        } catch {
          clients.delete(c);
        }
      }
    },
    stop() {
      if (ping) clearInterval(ping);
      for (const c of clients) {
        try {
          c.close();
        } catch {}
      }
      clients.clear();
      server.stop(true);
    },
  };
}
