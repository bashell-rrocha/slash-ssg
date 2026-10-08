// scripts/update-imports.ts - Atualizar imports para usar subpaths otimizados
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

async function findTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findTsFiles(fullPath)));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function updateImports(filePath: string): Promise<boolean> {
  let content = await readFile(filePath, "utf-8");
  const original = content;

  // Map de símbolos para subpaths
  const coreSymbols = ["html", "render", "createState", "batch", "ErrorBoundary", "destroyNode", "h"];
  const routerSymbols = ["createRouter", "Router", "Route", "Link", "navigate"];
  const formsSymbols = ["createForm", "FormProvider", "useForm"];
  const ssrSymbols = ["renderToString", "renderToStream", "createLoader", "isServer"];

  // Detectar import de "slash"
  const importRegex = /import\s*{([^}]+)}\s*from\s*["']slash["']/g;
  const matches = [...content.matchAll(importRegex)];

  for (const match of matches) {
    const importList = match[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const core: string[] = [];
    const router: string[] = [];
    const forms: string[] = [];
    const ssr: string[] = [];

    for (const symbol of importList) {
      if (coreSymbols.includes(symbol)) {
        core.push(symbol);
      } else if (routerSymbols.includes(symbol)) {
        router.push(symbol);
      } else if (formsSymbols.includes(symbol)) {
        forms.push(symbol);
      } else if (ssrSymbols.includes(symbol)) {
        ssr.push(symbol);
      } else {
        // Default para core se não encontrado
        core.push(symbol);
      }
    }

    // Construir novos imports
    const newImports: string[] = [];

    if (core.length > 0) {
      newImports.push(`import { ${core.join(", ")} } from "@_bashell/slash/core"`);
    }
    if (router.length > 0) {
      newImports.push(`import { ${router.join(", ")} } from "@_bashell/slash/router"`);
    }
    if (forms.length > 0) {
      newImports.push(`import { ${forms.join(", ")} } from "@_bashell/slash/forms"`);
    }
    if (ssr.length > 0) {
      newImports.push(`import { ${ssr.join(", ")} } from "@_bashell/slash/ssr"`);
    }

    // Substituir import antigo pelos novos
    content = content.replace(match[0], newImports.join(";\n"));
  }

  if (content !== original) {
    await writeFile(filePath, content, "utf-8");
    return true;
  }

  return false;
}

async function main() {
  console.log("🔄 Atualizando imports para usar subpaths otimizados...\n");

  const srcDir = resolve(ROOT, "src");
  const files = await findTsFiles(srcDir);

  let updated = 0;

  for (const file of files) {
    const changed = await updateImports(file);
    if (changed) {
      console.log(`  ✓ ${file.replace(ROOT, ".")}`);
      updated++;
    }
  }

  console.log(`\n✅ ${updated} arquivo(s) atualizado(s)`);
}

main().catch(console.error);
