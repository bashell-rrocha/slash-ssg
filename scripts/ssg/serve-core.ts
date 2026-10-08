import { escapeHtml } from "../../src/lib/escape";

export type RequestResolution =
  | { kind: "file"; file: string; status: 200 | 404 }
  | { kind: "redirect"; location: string };

export const DEFAULT_PORT = 4000;

const NOT_FOUND: RequestResolution = { kind: "file", file: "404.html", status: 404 };

// Decide o que servir para uma URL, sem tocar no disco: `exists` recebe caminhos relativos a dist/.
export function resolveRequest(url: URL, exists: (relFile: string) => boolean): RequestResolution {
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return NOT_FOUND;
  }
  if (pathname.split("/").includes("..") || pathname.includes("\0")) return NOT_FOUND;

  const rel = pathname.replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) {
    const index = `${rel}index.html`;
    return exists(index) ? { kind: "file", file: index, status: 200 } : NOT_FOUND;
  }
  if (exists(rel)) return { kind: "file", file: rel, status: 200 };
  if (exists(`${rel}/index.html`)) return { kind: "redirect", location: `/${rel}/${url.search}` };
  return NOT_FOUND;
}

// Lê a porta de process.env.PORT: ausente ou vazia usa 4000; qualquer outro valor precisa ser um
// inteiro entre 1 e 65535
export function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;
  const value = raw.trim();
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(`PORT inválida: "${raw}" (use um número inteiro entre 1 e 65535)`);
  }
  return port;
}

// Página de erro do dev: mostra a mensagem do build e recarrega sozinha quando o build é corrigido.
export function renderErrorPage(message: string, lang = "pt-BR"): string {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<title>Erro de build</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#1b1b1f;color:#f4f4f5}h1{color:#ff6b6b}pre{white-space:pre-wrap;background:#000;padding:1rem;border-radius:.5rem}</style>
</head>
<body>
<h1>Erro de build</h1>
<pre>${escapeHtml(message)}</pre>
<script>new EventSource("/__reload").onmessage=()=>location.reload()</script>
</body>
</html>
`;
}
