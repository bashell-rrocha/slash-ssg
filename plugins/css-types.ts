// packages/slash-ssg/plugins/css-types.ts
// Bun plugin: gera .d.ts ao lado de cada *.module.css durante o build/rebuild.
// Corrigido para evitar loop de rebuild: só escreve o .d.ts se o conteúdo mudou.

import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";

// use tipagem do Bun sem importar módulo (evita problemas de tipo/emit)
type BunPlugin = import("bun").BunPlugin;

export type CssTypesPluginOptions = {
  /** Loga quando gerar/atualizar .d.ts (default: true) */
  verbose?: boolean;
};

export function cssModuleTypesPlugin(
  opts: CssTypesPluginOptions = {}
): BunPlugin {
  const verbose = opts.verbose ?? true;

  return {
    name: "slash-css-types",
    async setup(builder) {
      builder.onLoad({ filter: /\.module\.css$/ }, async (args) => {
        // 1) lê CSS
        let css: string;
        try {
          css = await readFile(args.path, "utf8");
        } catch {
          return;
        }

        // 2) saneia e extrai classes
        const clean = stripIrrelevant(css);
        const noGlobal = stripGlobalBlocks(clean);
        const classes = extractClassNamesWithNesting(noGlobal);

        // 3) gera conteúdo do .d.ts
        const dtsPath = args.path + ".d.ts";
        const content =
`// ⚠️ gerado automaticamente por slash-css-types (Bun plugin)
// Fonte: ${args.path}
declare const styles: {
${[...classes].sort().map(k => `  readonly "${k}": string;`).join("\n")}
};
export default styles;
`;

        // 4) só escreve se mudou — evita loop de rebuild por mtime
        let prev = "";
        try { prev = await readFile(dtsPath, "utf8"); } catch {}
        if (prev !== content) {
          await writeFile(dtsPath, content, "utf8");
          if (verbose) {
            const relRoot = (builder as any)?.config?.root || process.cwd();
            const rel = relative(relRoot, dtsPath).split("\\").join("/");
            console.log("✓ css types:", rel);
          }
        }
        // retornando void: Bun continua o carregamento padrão do .css
      });
    },
  };
}

/* -------------------- helpers (robustos e sem replaceAll) -------------------- */

// remove comentários, strings, url(...) — evita falsos positivos
function stripIrrelevant(input: string): string {
  let out = ""; let i = 0; const n = input.length;
  let mode: "normal" | "slash" | "block" | "line" | "squote" | "dquote" | "url" = "normal";
  let urlDepth = 0;

  while (i < n) {
    const c = input[i]; const c2 = input[i + 1];

    if (mode === "normal") {
      if (c === "/") { mode = "slash"; i++; continue; }
      if (c === "'") { mode = "squote"; i++; continue; }
      if (c === '"') { mode = "dquote"; i++; continue; }
      if ((c === "u" || c === "U") && input.slice(i, i + 4).toLowerCase() === "url(") {
        mode = "url"; urlDepth = 1; i += 4; continue;
      }
      out += c; i++; continue;
    }
    if (mode === "slash") {
      if (c2 === "*") { mode = "block"; i += 2; continue; }
      if (c2 === "/") { mode = "line"; i += 2; continue; }
      out += "/"; mode = "normal"; continue;
    }
    if (mode === "block") { if (c === "*" && c2 === "/") { mode = "normal"; i += 2; continue; } i++; continue; }
    if (mode === "line") { if (c === "\n") mode = "normal"; i++; continue; }
    if (mode === "squote") { if (c === "\\" && i + 1 < n) { i += 2; continue; } if (c === "'") { mode = "normal"; i++; continue; } i++; continue; }
    if (mode === "dquote") { if (c === "\\" && i + 1 < n) { i += 2; continue; } if (c === '"') { mode = "normal"; i++; continue; } i++; continue; }
    if (mode === "url") {
      if (c === "(") { urlDepth++; i++; continue; }
      if (c === ")") { urlDepth--; i++; if (urlDepth === 0) mode = "normal"; continue; }
      i++; continue;
    }
  }
  return out;
}

// remove :global( ... ) incluindo parênteses aninhados
function stripGlobalBlocks(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith(":global(", i)) {
      const start = i + ":global(".length;
      const end = findMatchingParen(s, start - 1);
      if (end === -1) break;
      i = end;
    } else out += s[i];
  }
  return out;
}

function findMatchingParen(s: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// parser simplificado de seletores com nesting (&) e @-rules
function extractClassNamesWithNesting(css: string): Set<string> {
  const classes = new Set<string>();
  const selStack: string[][] = [[""]];

  let buf = "";
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];

    if (ch === "{") {
      const rawSelector = buf.trim(); buf = "";

      if (rawSelector.startsWith("@")) {
        const current = selStack[selStack.length - 1] ?? [""];
        selStack.push(current);
        continue;
      }

      const parts = splitSelectors(rawSelector);
      const parent = selStack[selStack.length - 1] ?? [""];
      const expanded = expandAmpersand(parts, parent);

      for (const sel of expanded) {
        for (const cls of findClassesInSelector(sel)) classes.add(cls);
      }

      selStack.push(expanded.length ? expanded : parent);
      continue;
    }

    if (ch === "}") { if (selStack.length > 1) selStack.pop(); continue; }

    buf += ch;
  }
  return classes;
}

function splitSelectors(selText: string): string[] {
  const sels: string[] = []; let cur = "";
  let r = 0, s = 0, c = 0;
  for (let i = 0; i < selText.length; i++) {
    const ch = selText[i];
    if (ch === "(") r++; else if (ch === ")") r--;
    else if (ch === "[") s++; else if (ch === "]") s--;
    else if (ch === "{") c++; else if (ch === "}") c--;
    else if (ch === "," && r === 0 && s === 0 && c === 0) {
      if (cur.trim()) sels.push(cur.trim()); cur = ""; continue;
    }
    cur += ch;
  }
  if (cur.trim()) sels.push(cur.trim());
  return sels;
}

function expandAmpersand(parts: string[], parents: string[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    if (p.indexOf("&") >= 0) {
      for (const parent of parents) {
        const expanded = (parent || "") === ""
          ? p.split("&").join("")   // sem replaceAll, compat ES2020+
          : p.split("&").join(parent);
        out.push(expanded.trim());
      }
    } else {
      out.push(p.trim());
    }
  }
  return out;
}

function findClassesInSelector(sel: string): string[] {
  sel = sel.replace(/:local\(/g, "(");
  sel = stripGlobalBlocks(sel);
  // aceita BEM (.block__elem--mod), múltiplas classes (.a.b), etc.
  const re = /(^|[^a-zA-Z0-9_-])\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*(?:__(?:[_a-zA-Z0-9-]+))*(?:--(?:[_a-zA-Z0-9-]+))*)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sel))) {
    const name = m[2];
    if (name) out.push(name);
  }
  return out;
}

