// packages/slash-ssg/scripts/ssg/toolchain.test.ts
// Gate de toolchain: sharp sob Bun e determinismo de CSS Modules entre targets.
import { expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { cssModuleTypesPlugin } from "../../plugins/css-types";

const entry = resolve(import.meta.dir, "__fixtures__/css/entry.ts");

async function build(target: "bun" | "browser") {
  const outdir = await mkdtemp(join(tmpdir(), `ssg-css-${target}-`));
  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    target,
    plugins: [cssModuleTypesPlugin({ verbose: false })],
  });
  expect(result.success).toBe(true);
  return { outdir, result };
}

test("sharp converte para avif, webp e jpeg sob Bun", async () => {
  const input = await sharp({ create: { width: 64, height: 32, channels: 4, background: "#f00" } })
    .png()
    .toBuffer();
  for (const fmt of ["avif", "webp", "jpeg"] as const) {
    const meta = await sharp(await sharp(input).toFormat(fmt).toBuffer()).metadata();
    expect(meta.format).toBe(fmt === "avif" ? "heif" : fmt);
    expect(meta.width).toBe(64);
  }
});

test("CSS Modules gera os mesmos nomes de classe em target bun e browser", async () => {
  const bun = await build("bun");
  const browser = await build("browser");
  try {
    const bunJs = bun.result.outputs.find((o) => o.path.endsWith(".js"));
    expect(bunJs).toBeDefined();
    const mod = await import(bunJs?.path ?? "");
    const bunClass: string = mod.styles.box;
    expect(typeof bunClass).toBe("string");

    const jsFile = (await readdir(browser.outdir)).find((f) => f.endsWith(".js"));
    expect(jsFile).toBeDefined();
    const text = await readFile(join(browser.outdir, jsFile ?? ""), "utf8");
    const m = text.match(/box:\s*"([^"]+)"/);
    expect(m).not.toBeNull();
    const browserClass = m?.[1] ?? "";

    expect(bunClass).toBe(browserClass);
  } finally {
    await rm(bun.outdir, { recursive: true, force: true });
    await rm(browser.outdir, { recursive: true, force: true });
  }
});

test("bundle target bun emite um arquivo .css", async () => {
  const { outdir, result } = await build("bun");
  try {
    expect(result.outputs.some((o) => o.path.endsWith(".css"))).toBe(true);
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});
