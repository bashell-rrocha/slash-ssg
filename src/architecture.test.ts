import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { Glob } from "bun";

// Regras de arquitetura do projeto. Ajuste as constantes desta seção ao crescer o site; as regras ficam iguais.
// Roda em toda mudança (custa menos de 1 s): `bun test src/architecture.test.ts`.

const ROOT = resolve(import.meta.dir, "..");
const SELF = "src/architecture.test.ts";

/** Arquivos isentos das regras de camada, dados, cor e AAA. A lista só diminui. */
const LEGACY: readonly string[] = [];

/** Camadas. As de atomic design são opcionais: valem quando a pasta existir. A mais específica vence. */
const LAYERS = {
  atoms: "src/components/atoms/",
  molecules: "src/components/molecules/",
  organisms: "src/components/organisms/",
  templates: "src/components/templates/",
  components: "src/components/",
  pages: "src/pages/",
  islands: "src/islands/",
} as const;

type Layer = keyof typeof LAYERS;

const DATA = "src/data/";
/** Framework, configuração e estilos globais: qualquer camada pode importar. */
const SHARED: readonly string[] = [
  "src/assets/",
  "src/lib/",
  "src/styles/",
  "src/site",
  "src/styles.module.css",
  "src/tokens.module.css",
];

/** Entradas com "/" no fim são pastas; as demais são um módulo exato. */
const ALLOWED_IMPORTS = {
  atoms: [LAYERS.atoms, ...SHARED],
  molecules: [LAYERS.atoms, LAYERS.molecules, ...SHARED],
  organisms: [LAYERS.atoms, LAYERS.molecules, LAYERS.organisms, LAYERS.islands, ...SHARED],
  templates: [LAYERS.atoms, LAYERS.molecules, LAYERS.organisms, LAYERS.templates, ...SHARED],
  components: [LAYERS.components, LAYERS.islands, ...SHARED],
  pages: [LAYERS.components, LAYERS.pages, LAYERS.islands, DATA, ...SHARED],
  islands: [LAYERS.components, LAYERS.islands, ...SHARED],
} as const satisfies Record<Layer, readonly string[]>;

/** Infraestrutura do portão de conteúdo: não são dados e ficam fora de `allContent`. */
const DATA_INFRA: readonly string[] = ["src/data/gate.ts", "src/data/walk.ts"];

/** Únicos arquivos com cor literal: os tokens e os temas. */
const COLOR_FILES: readonly string[] = ["src/tokens.module.css"];
const THEME_FILE = /^src\/styles\/themes\/[\w-]+\.css$/;

/** `unsafeHtml` desliga o escape: cada uso precisa estar listado aqui, com conteúdo confiável. */
const UNSAFE_HTML_ALLOWED: readonly string[] = [];

interface ImportRef {
  readonly target: string;
  readonly typeOnly: boolean;
}

interface Violation {
  readonly file: string;
  readonly detail: string;
}

const STATIC_IMPORT =
  /(?<![\w$.])(?:import|export)\s+(type\s+)?(?:(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\}|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?)\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /(?<![\w$.])import\(\s*["']([^"']+)["']\s*\)/g;
const NAMED_CLAUSE = /^\{([^}]*)\}$/;
const TEST_CALL = /(?<![.\w])(?:test|it)(?:\.\w+)?\(/g;
const AAA_MARKER = /\/\/ (Arrange|Act|Assert)\b/g;
const CSS_HEX = /#[0-9a-f]{3,8}\b/i;
const TS_HEX = /(fill|stroke|stop-color|color|background|--[\w-]+)\s*[:=]\s*["']?#[0-9a-f]{3,8}\b/i;
const TS_HEX_STRING = /["'`]#[0-9a-f]{3,8}["'`]/i;
const COLOR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
/** Em TS, `color(` seria qualquer função chamada color: fica só nas funções inequívocas. */
const TS_COLOR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|oklab|oklch)\(/i;
/** Cores nomeadas do CSS (as 148 do CSS Color 4); `transparent` e `currentcolor` são palavras-chave, não cor. */
const NAMED_COLORS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
    "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod " +
    "darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon " +
    "darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray " +
    "dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green " +
    "greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon " +
    "lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon " +
    "lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta " +
    "maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen " +
    "mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive " +
    "olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru " +
    "pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen " +
    "seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato " +
    "turquoise violet wheat white whitesmoke yellow yellowgreen"
  ).split(" "),
);
const CSS_WORD = /(?<![\w-])[a-z]+(?![\w-])/gi;
const FORBIDDEN_TYPING = /@ts-ignore|@ts-nocheck|\bas any\b|:\s*any\b|<any[,>]|\bany\[\]/;
const EXPECT_ERROR = /@ts-expect-error(.*)$/;
const MIN_JUSTIFICATION = 10;
const KEYFRAMES_RULE = /^\s*@keyframes\b/;

function scan(pattern: string): string[] {
  return [...new Glob(pattern).scanSync({ cwd: ROOT })].map((file) => file.split("\\").join("/"));
}

/** Código do projeto: fica de fora o framework (`src/lib/`, `scripts/ssg/`), que tem os próprios testes. */
function projectFiles(): string[] {
  const src = scan("src/**/*.{ts,css}").filter((file) => !file.startsWith("src/lib/"));
  const scripts = scan("scripts/**/*.ts").filter((file) => !file.startsWith("scripts/ssg/"));
  return [...src, ...scripts].filter((file) => !file.endsWith(".d.ts")).sort();
}

function read(file: string): string {
  return readFileSync(resolve(ROOT, file), "utf8");
}

function isLegacy(file: string): boolean {
  return LEGACY.includes(file);
}

function isTest(file: string): boolean {
  return file.endsWith(".test.ts");
}

function sourceFiles(): string[] {
  return projectFiles().filter((file) => file !== SELF);
}

function tsSourceFiles(): string[] {
  return sourceFiles().filter((file) => file.endsWith(".ts"));
}

function isTypeOnlyClause(clause: string | undefined): boolean {
  const named = clause?.trim().match(NAMED_CLAUSE);
  if (!named?.[1]) return false;
  const names = named[1]
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  return names.length > 0 && names.every((name) => name.startsWith("type "));
}

function resolveSpecifier(file: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const absolute = resolve(ROOT, dirname(file), specifier);
  return relative(ROOT, absolute)
    .split("\\")
    .join("/")
    .replace(/\.(ts|js)$/, "")
    .replace(/\/index$/, "");
}

function parseImports(file: string, source: string): ImportRef[] {
  const statics = [...source.matchAll(STATIC_IMPORT)].map((match) => ({
    index: match.index,
    specifier: match[3],
    typeOnly: match[1] !== undefined || isTypeOnlyClause(match[2]),
  }));
  const dynamics = [...source.matchAll(DYNAMIC_IMPORT)].map((match) => ({
    index: match.index,
    specifier: match[1],
    typeOnly: false,
  }));
  return [...statics, ...dynamics]
    .sort((a, b) => a.index - b.index)
    .flatMap(({ specifier, typeOnly }) => {
      const target = specifier === undefined ? null : resolveSpecifier(file, specifier);
      return target === null ? [] : [{ target, typeOnly }];
    });
}

function importsOf(file: string): ImportRef[] {
  return parseImports(file, read(file));
}

function matchesEntry(target: string, entry: string): boolean {
  if (!entry.endsWith("/")) return target === entry;
  return target === entry.slice(0, -1) || target.startsWith(entry);
}

function layerOf(file: string): Layer | null {
  const layers = (Object.keys(LAYERS) as Layer[]).filter((layer) => file.startsWith(LAYERS[layer]));
  return layers.sort((a, b) => LAYERS[b].length - LAYERS[a].length)[0] ?? null;
}

/** Tipos de `src/data` podem ir a qualquer camada; valores, só onde a regra 2 deixa. */
function isAllowedImport(layer: Layer, ref: ImportRef): boolean {
  if (ref.typeOnly && matchesEntry(ref.target, DATA)) return true;
  return ALLOWED_IMPORTS[layer].some((entry) => matchesEntry(ref.target, entry));
}

function layerViolations(file: string): Violation[] {
  const layer = layerOf(file);
  if (layer === null) return [];
  return importsOf(file)
    .filter((ref) => !isAllowedImport(layer, ref))
    .map((ref) => ({ file, detail: `${layer} não pode importar ${ref.target}` }));
}

function mayImportDataValues(file: string): boolean {
  return (
    file.startsWith(LAYERS.pages) || file === "src/routes.ts" || file.startsWith("scripts/") || file.startsWith(DATA)
  );
}

function isDataValueImport(ref: ImportRef): boolean {
  return matchesEntry(ref.target, DATA) && !ref.typeOnly;
}

function dataViolations(file: string): Violation[] {
  if (mayImportDataValues(file)) return [];
  return importsOf(file)
    .filter(isDataValueImport)
    .map((ref) => ({ file, detail: `importa ${ref.target}` }));
}

function importViolations(file: string, forbidden: readonly string[]): Violation[] {
  return importsOf(file)
    .filter((ref) => forbidden.some((entry) => matchesEntry(ref.target, entry)))
    .map((ref) => ({ file, detail: `importa ${ref.target}` }));
}

function lineViolations(file: string, isViolation: (line: string) => boolean): Violation[] {
  return read(file)
    .split("\n")
    .flatMap((line, index) => (isViolation(line) ? [{ file, detail: `linha ${index + 1}: ${line.trim()}` }] : []));
}

/** Em CSS, cor nomeada só conta no valor de uma declaração (depois do `:`), fora de `var(--…)`. */
function hasNamedColor(line: string): boolean {
  if (/[{,]\s*$/.test(line)) return false; // seletor, não declaração
  const colon = line.indexOf(":");
  if (colon === -1) return false;
  const value = line.slice(colon + 1).replace(/var\([^)]*\)/g, "");
  return [...value.matchAll(CSS_WORD)].some((match) => NAMED_COLORS.has(match[0].toLowerCase()));
}

function hasLiteralColor(file: string, line: string): boolean {
  if (file.endsWith(".css")) return CSS_HEX.test(line) || COLOR_FUNCTION.test(line) || hasNamedColor(line);
  return TS_HEX.test(line) || TS_HEX_STRING.test(line) || TS_COLOR_FUNCTION.test(line);
}

function hasForbiddenTyping(line: string): boolean {
  if (FORBIDDEN_TYPING.test(line)) return true;
  const expectError = line.match(EXPECT_ERROR);
  if (!expectError) return false;
  const justification = (expectError[1] ?? "").replace(/^[\s:—–-]+/, "").trim();
  return justification.length < MIN_JUSTIFICATION;
}

function filesContaining(needle: string): string[] {
  return sourceFiles().filter((file) => read(file).includes(needle));
}

function aaaViolations(file: string): Violation[] {
  const source = read(file);
  const tests = source.match(TEST_CALL)?.length ?? 0;
  const markers = [...source.matchAll(AAA_MARKER)].map((match) => match[1]);
  const asserts = markers.filter((marker) => marker === "Assert").length;
  const violations: Violation[] = [];
  if (asserts !== tests) violations.push({ file, detail: `${tests} testes e ${asserts} marcadores Assert` });

  let seen = new Set<string>();
  for (const marker of markers) {
    if (marker === undefined) continue;
    if (marker !== "Assert") {
      if (marker === "Act" && !seen.has("Arrange")) violations.push({ file, detail: "marcador Act antes do Arrange" });
      seen.add(marker);
      continue;
    }
    if (!seen.has("Arrange") || !seen.has("Act")) {
      violations.push({ file, detail: "marcador Assert sem Arrange e Act antes" });
    }
    seen = new Set<string>();
  }
  return violations;
}

describe("parseImports", () => {
  test("lê import com from, import type, import de efeito e resolve o caminho", () => {
    // Arrange
    const source = [
      'import { a } from "../data/posts";',
      'import type { B } from "../data/posts";',
      'import { type C, type D } from "./c";',
      'import "../tokens.module.css";',
      'import { e } from "@_bashell/slash/core";',
    ].join("\n");

    // Act
    const imports = parseImports("src/pages/x.ts", source);

    // Assert
    expect(imports).toEqual([
      { target: "src/data/posts", typeOnly: false },
      { target: "src/data/posts", typeOnly: true },
      { target: "src/pages/c", typeOnly: true },
      { target: "src/tokens.module.css", typeOnly: false },
    ]);
  });

  test("lê reexport com export *, export { } e export type { }", () => {
    // Arrange
    const source = [
      'export * from "../data/posts";',
      'export { x } from "../data/posts";',
      'export type { Y } from "../data/posts";',
    ].join("\n");

    // Act
    const imports = parseImports("src/components/x.ts", source);

    // Assert
    expect(imports).toEqual([
      { target: "src/data/posts", typeOnly: false },
      { target: "src/data/posts", typeOnly: false },
      { target: "src/data/posts", typeOnly: true },
    ]);
  });

  test("lê import dinâmico como import de valor", () => {
    // Arrange
    const source = 'const mod = await import("../data/posts");';

    // Act
    const imports = parseImports("src/components/x.ts", source);

    // Assert
    expect(imports).toEqual([{ target: "src/data/posts", typeOnly: false }]);
  });

  test("lê mais de um import na mesma linha", () => {
    // Arrange
    const source = 'import { a } from "./a"; import type { B } from "./b";';

    // Act
    const imports = parseImports("src/components/x.ts", source);

    // Assert
    expect(imports).toEqual([
      { target: "src/components/a", typeOnly: false },
      { target: "src/components/b", typeOnly: true },
    ]);
  });

  test("não confunde declaração export type local com reexport", () => {
    // Arrange
    const source = ["export type Local = string", 'import { a } from "./a";'].join("\n");

    // Act
    const imports = parseImports("src/components/x.ts", source);

    // Assert
    expect(imports).toEqual([{ target: "src/components/a", typeOnly: false }]);
  });

  test("normaliza import da pasta e de /index para o caminho da pasta", () => {
    // Arrange
    const source = ['import { a } from "../data";', 'import { b } from "../data/index.ts";'].join("\n");

    // Act
    const targets = parseImports("src/pages/x.ts", source).map((ref) => ref.target);

    // Assert
    expect(targets).toEqual(["src/data", "src/data"]);
  });
});

describe("matchesEntry", () => {
  test("a entrada de pasta casa com o índice da própria pasta", () => {
    // Arrange
    const target = "src/data";

    // Act
    const matches = matchesEntry(target, DATA);

    // Assert
    expect(matches).toBe(true);
  });

  test("a entrada de pasta não casa com pasta de nome parecido", () => {
    // Arrange
    const target = "src/database/x";

    // Act
    const matches = matchesEntry(target, DATA);

    // Assert
    expect(matches).toBe(false);
  });
});

describe("layerOf", () => {
  test("a pasta atomic vence a pasta components que a contém", () => {
    // Arrange
    const file = "src/components/atoms/button.ts";

    // Act
    const layer = layerOf(file);

    // Assert
    expect(layer).toBe("atoms");
  });

  test("arquivo direto em components fica na camada components", () => {
    // Arrange
    const file = "src/components/layout.ts";

    // Act
    const layer = layerOf(file);

    // Assert
    expect(layer).toBe("components");
  });
});

describe("isAllowedImport", () => {
  test("ilha não importa valor de src/data", () => {
    // Arrange
    const ref: ImportRef = { target: "src/data/posts", typeOnly: false };

    // Act
    const allowed = isAllowedImport("islands", ref);

    // Assert
    expect(allowed).toBe(false);
  });

  test("componente importa só o tipo de src/data", () => {
    // Arrange
    const ref: ImportRef = { target: "src/data/posts", typeOnly: true };

    // Act
    const allowed = isAllowedImport("components", ref);

    // Assert
    expect(allowed).toBe(true);
  });

  test("atom não importa molecule", () => {
    // Arrange
    const ref: ImportRef = { target: "src/components/molecules/card", typeOnly: false };

    // Act
    const allowed = isAllowedImport("atoms", ref);

    // Assert
    expect(allowed).toBe(false);
  });
});

describe("hasLiteralColor", () => {
  test.each([
    'const c = "#ff0000";',
    '  { primary: "#fff" },',
    "const c = `#abc`;",
  ])("acusa hex solto em string de TS: %s", (line) => {
    // Arrange
    const file = "src/components/x.ts";

    // Act
    const flagged = hasLiteralColor(file, line);

    // Assert
    expect(flagged).toBe(true);
  });

  test("acusa hex e rgb em CSS", () => {
    // Arrange
    const lines = ["  border: 1px solid #8884;", "  color: rgb(0 0 0);"];

    // Act
    const flagged = lines.map((line) => hasLiteralColor("src/styles.module.css", line));

    // Assert
    expect(flagged).toEqual([true, true]);
  });

  test.each([
    "  background: royalblue;",
    "  color: white;",
    "  border: 1px solid Red;",
    "  color: oklch(70% 0.1 200);",
    "  background: color-mix(in srgb, var(--a) 40%, white);",
    "  color: hwb(0 0% 0%);",
    "  color: color(display-p3 1 0 0);",
  ])("acusa cor nomeada e função de cor em CSS: %s", (line) => {
    // Arrange
    const file = "src/styles.module.css";

    // Act
    const flagged = hasLiteralColor(file, line);

    // Assert
    expect(flagged).toBe(true);
  });

  test.each([
    "  white-space: nowrap;",
    "  color: var(--color-white);",
    "  border-color: currentcolor;",
    "  background: transparent;",
    "  background: color-mix(in srgb, var(--a), var(--b));",
    "  font: 1rem system-ui;",
    ".white {",
    ".btn:not(.red) {",
    "a:hover,",
  ])("não acusa propriedade, variável ou palavra-chave sem cor: %s", (line) => {
    // Arrange
    const file = "src/styles.module.css";

    // Act
    const flagged = hasLiteralColor(file, line);

    // Assert
    expect(flagged).toBe(false);
  });

  test("não acusa chamada de função chamada color em TS", () => {
    // Arrange
    const line = "const c = color(theme);";

    // Act
    const flagged = hasLiteralColor("src/components/x.ts", line);

    // Assert
    expect(flagged).toBe(false);
  });

  test("não acusa âncora de link em TS", () => {
    // Arrange
    const line = 'const href = "#contato";';

    // Act
    const flagged = hasLiteralColor("src/components/x.ts", line);

    // Assert
    expect(flagged).toBe(false);
  });
});

describe("hasForbiddenTyping", () => {
  test.each([
    "const x: any = 1;",
    "foo as any",
    "// @ts-ignore",
    "// @ts-expect-error",
    "// @ts-nocheck",
    "const list: Array<any> = [];",
    "const xs = [] as any[];",
    "const p = <any>value;",
  ])("acusa %s", (line) => {
    // Arrange
    const source = line;

    // Act
    const flagged = hasForbiddenTyping(source);

    // Assert
    expect(flagged).toBe(true);
  });

  test("aceita @ts-expect-error com justificativa", () => {
    // Arrange
    const line = "// @ts-expect-error: a lib não exporta o tipo do evento";

    // Act
    const flagged = hasForbiddenTyping(line);

    // Assert
    expect(flagged).toBe(false);
  });
});

describe("arquitetura do projeto", () => {
  test("LEGACY: cada arquivo isento ainda existe, para a lista só diminuir", () => {
    // Arrange
    const legacy = [...LEGACY];

    // Act
    const missing = legacy.filter((file) => !existsSync(resolve(ROOT, file)));

    // Assert
    expect(missing).toEqual([]);
  });

  test("regra 1: cada camada só importa o que a matriz permite", () => {
    // Arrange
    const files = sourceFiles().filter((file) => !isLegacy(file));

    // Act
    const violations = files.flatMap(layerViolations);

    // Assert
    expect(violations).toEqual([]);
  });

  test("regra 2: só pages, routes.ts, scripts e data importam valores de src/data", () => {
    // Arrange
    const files = tsSourceFiles().filter((file) => !isLegacy(file));

    // Act
    const violations = files.flatMap(dataViolations);

    // Assert
    expect(violations).toEqual([]);
  });

  test("regra 3: pages não importam atoms nem molecules", () => {
    // Arrange
    const files = tsSourceFiles().filter((file) => file.startsWith(LAYERS.pages) && !isLegacy(file));

    // Act
    const violations = files.flatMap((file) => importViolations(file, [LAYERS.atoms, LAYERS.molecules]));

    // Assert
    expect(violations).toEqual([]);
  });

  test("regra 4: ilhas não importam src/data", () => {
    // Arrange
    const files = tsSourceFiles().filter((file) => file.startsWith(LAYERS.islands) && !isLegacy(file));

    // Act
    const violations = files.flatMap((file) =>
      importsOf(file)
        .filter(isDataValueImport)
        .map((ref) => ({ file, detail: `importa ${ref.target}` })),
    );

    // Assert
    expect(violations).toEqual([]);
  });

  test("regra 5: nenhuma cor literal fora dos tokens e dos temas", () => {
    // Arrange
    const isColorFile = (file: string): boolean => COLOR_FILES.includes(file) || THEME_FILE.test(file);
    const files = sourceFiles().filter((file) => !isColorFile(file) && !isTest(file) && !isLegacy(file));

    // Act
    const violations = files.flatMap((file) => lineViolations(file, (line) => hasLiteralColor(file, line)));

    // Assert
    expect(violations).toEqual([]);
  });

  test("regra 6: unsafeHtml só nos arquivos listados em UNSAFE_HTML_ALLOWED", () => {
    // Arrange
    const allowed = [...UNSAFE_HTML_ALLOWED];

    // Act
    const files = filesContaining("unsafeHtml").filter((file) => !allowed.includes(file));

    // Assert
    expect(files).toEqual([]);
  });

  test("regra 7: nenhum @ts-ignore, as any ou : any, e todo @ts-expect-error tem justificativa", () => {
    // Arrange
    const files = tsSourceFiles();

    // Act
    const violations = files.flatMap((file) => lineViolations(file, hasForbiddenTyping));

    // Assert
    expect(violations).toEqual([]);
  });

  test("regra 8: todo teste fora do framework e de LEGACY segue o padrão AAA", () => {
    // Arrange
    const files = projectFiles().filter((file) => isTest(file) && !isLegacy(file));

    // Act
    const violations = files.flatMap(aaaViolations);

    // Assert
    expect(violations).toEqual([]);
  });

  test("regra 10: todo arquivo de dados está registrado em allContent (src/data/index.ts)", () => {
    // Arrange
    const index = `${DATA}index.ts`;
    const dataFiles = tsSourceFiles().filter(
      (file) => file.startsWith(DATA) && !isTest(file) && !DATA_INFRA.includes(file) && file !== index,
    );

    // Act
    const registered = new Set(importsOf(index).map((ref) => `${ref.target}.ts`));
    const missing = dataFiles.filter((file) => !registered.has(file));

    // Assert
    expect(missing).toEqual([]);
  });

  test("regra 9: nenhum @keyframes em CSS module (o Bun renomeia o nome, mas não a referência em animation)", () => {
    // Arrange
    const modules = sourceFiles().filter((file) => file.endsWith(".module.css"));

    // Act
    const violations = modules.flatMap((file) => lineViolations(file, (line) => KEYFRAMES_RULE.test(line)));

    // Assert
    expect(violations).toEqual([]);
  });
});
