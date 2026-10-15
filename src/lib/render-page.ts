import { SsgError } from "./errors";
import { escapeHtml } from "./escape";

const HEAD_MARKER = "<!--slash:head-->";
const APP_MARKER = "<!--slash:app-->";
const MARKERS = new RegExp(`${HEAD_MARKER}|${APP_MARKER}`, "g");

export function assertShell(shell: string): void {
  for (const marker of [HEAD_MARKER, APP_MARKER]) {
    if (!shell.includes(marker)) {
      throw new SsgError(`public/index.html sem o marcador ${marker}`);
    }
  }
}

// Define lang="..." na tag <html> da casca (substitui o existente ou adiciona)
export function applyLang(shell: string, lang: string): string {
  const attr = `lang="${escapeHtml(lang)}"`;
  return shell.replace(/<html(\s[^>]*)?>/i, (_m, attrs: string | undefined) => {
    const rest = (attrs ?? "").replace(/\slang\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "");
    return `<html ${attr}${rest}>`;
  });
}

// Define atributos na tag <html> da casca: substitui no lugar o que já existe, acrescenta o resto no fim (na ordem dada)
export function applyHtmlAttrs(shell: string, attrs: Readonly<Record<string, string>>): string {
  return shell.replace(/<html(\s[^>]*)?>/i, (_m, existing: string | undefined) => {
    let out = existing ?? "";
    for (const [name, value] of Object.entries(attrs)) {
      const attr = `${name}="${escapeHtml(value)}"`;
      const current = new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "i");
      out = current.test(out) ? out.replace(current, () => ` ${attr}`) : `${out} ${attr}`;
    }
    return `<html${out}>`;
  });
}

export function renderDocument(input: {
  shell: string;
  head: string;
  body: string;
  scriptSrc: string | null;
  lang: string;
  /** Atributos do <html> além do lang (ex.: data-theme e data-mode do tema). */
  htmlAttrs?: Readonly<Record<string, string>>;
}): string {
  const { shell, head, body, scriptSrc, lang } = input;
  // Uma única passada: um head.extra (ou corpo) que contenha um marcador não é re-substituído.
  // Funções como replacement evitam que "$&" e similares sejam interpretados; só a 1ª ocorrência vale.
  const done = new Set<string>();
  let doc = applyHtmlAttrs(applyLang(shell, lang), input.htmlAttrs ?? {}).replace(MARKERS, (marker) => {
    if (done.has(marker)) return marker;
    done.add(marker);
    return marker === HEAD_MARKER ? head : body;
  });
  if (scriptSrc !== null && body.includes("data-island")) {
    const tag = `<script type="module" src="${scriptSrc}"></script>`;
    // Último </body>: o corpo da página pode conter o texto literal
    const at = doc.lastIndexOf("</body>");
    doc = at === -1 ? doc + tag : doc.slice(0, at) + tag + doc.slice(at);
  }
  return doc;
}
