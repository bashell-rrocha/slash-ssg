import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { SsgError } from "./errors";
import { resolveImagesConfig } from "./image-core";
import { generateOgImages, pool, processImages } from "./images-build";

let root: string;
let srcDir: string;
let outDir: string;
let cacheDir: string;

const config = resolveImagesConfig();
const run = () => processImages({ srcDir, outDir, cacheDir, config });

async function makeJpeg(name: string, width: number, height: number, exif = false) {
  let img = sharp({ create: { width, height, channels: 3, background: "#3366cc" } }).jpeg();
  if (exif) img = img.withMetadata({ exif: { IFD0: { Copyright: "segredo" } } });
  writeFileSync(join(srcDir, name), await img.toBuffer());
}

async function makePng(name: string, width: number, height: number) {
  const buf = await sharp({
    create: { width, height, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
  writeFileSync(join(srcDir, name), buf);
}

const imgFiles = () => readdirSync(join(outDir, "_img")).sort();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ssg-img-"));
  srcDir = join(root, "src");
  outDir = join(root, "dist");
  cacheDir = join(root, "cache");
  mkdirSync(srcDir, { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("images-build", () => {
  test("foto JPEG 2000px gera avif, webp e jpeg em 480/960/1440/1920", async () => {
    await makeJpeg("foto.jpg", 2000, 1000);
    const manifest = await run();
    const e = manifest.get("foto.jpg");
    expect(e).toBeDefined();
    expect(e).toMatchObject({ kind: "raster", width: 2000, height: 1000, format: "jpeg", hasAlpha: false });
    for (const key of ["avif", "webp", "fallback"] as const) {
      expect(e?.variants[key].map((v) => v.width)).toEqual([480, 960, 1440, 1920]);
    }
    expect(e?.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(e?.variants.fallback[0]?.url).toBe(`/_img/foto-${e?.hash}-480.jpg`);
    expect(e?.ogUrl).toBe(`/_img/foto-${e?.hash}-og.jpg`);
    expect(imgFiles()).toHaveLength(12);
    const m = await sharp(join(outDir, "_img", `foto-${e?.hash}-960.webp`)).metadata();
    expect(m).toMatchObject({ width: 960, height: 480, format: "webp" });
    expect(existsSync(join(cacheDir, "images-manifest.json"))).toBe(true);
  });

  test("PNG com alfa 1000px usa fallback png e larguras [480, 960, 1000]", async () => {
    await makePng("logo.png", 1000, 500);
    const e = (await run()).get("logo.png");
    expect(e?.hasAlpha).toBe(true);
    expect(e?.variants.fallback.map((v) => v.width)).toEqual([480, 960, 1000]);
    expect(e?.variants.fallback[0]?.url).toEndWith("-480.png");
    const m = await sharp(join(outDir, "_img", `logo-${e?.hash}-1000.png`)).metadata();
    expect(m).toMatchObject({ width: 1000, format: "png" });
  });

  test("nome com espaço, acento e extensão maiúscula gera URLs com slug", async () => {
    mkdirSync(join(srcDir, "mockups"));
    await makePng("mockups/Mockup Clínica.PNG", 600, 300);
    const manifest = await run();
    const e = manifest.get("mockups/Mockup Clínica.PNG");
    expect(e?.variants.fallback[0]?.url).toBe(`/_img/mockups-mockup-clinica-${e?.hash}-480.png`);
    expect(imgFiles().every((f) => f.startsWith("mockups-mockup-clinica-"))).toBe(true);
  });

  test("SVG é copiado sem processamento e tem width/height", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60"/></svg>';
    writeFileSync(join(srcDir, "icone.svg"), svg);
    const e = (await run()).get("icone.svg");
    expect(e).toMatchObject({ kind: "passthrough", width: 120, height: 60 });
    expect(e?.variants).toEqual({ avif: [], webp: [], fallback: [] });
    expect(e?.url).toBe(`/_img/icone-${e?.hash}.svg`);
    expect(await Bun.file(join(outDir, "_img", `icone-${e?.hash}.svg`)).text()).toBe(svg);
  });

  test("SVG sem dimensões usa o viewBox", async () => {
    writeFileSync(
      join(srcDir, "vb.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20"/></svg>',
    );
    const e = (await run()).get("vb.svg");
    expect(e).toMatchObject({ width: 40, height: 20 });
  });

  test("variante ausente no cache reprocessa a imagem em vez de lançar ENOENT", async () => {
    await makeJpeg("foto.jpg", 1000, 500);
    const first = (await run()).get("foto.jpg");
    const cached = join(cacheDir, "images", first?.hash ?? "");
    const victim = first?.variants.webp[0]?.url ?? "";
    rmSync(join(cached, victim.split("/").pop() ?? ""));
    rmSync(outDir, { recursive: true, force: true });
    const again = (await run()).get("foto.jpg");
    expect(again?.hash).toBe(first?.hash);
    expect(existsSync(join(outDir, victim))).toBe(true);
  });

  test("segunda execução reaproveita o cache (sharp não é chamado)", async () => {
    await makeJpeg("foto.jpg", 1000, 500);
    const first = await run();
    const e = first.get("foto.jpg");
    const cached = join(cacheDir, "images", e?.hash ?? "");
    const before = readdirSync(cached).map((f) => [f, statSync(join(cached, f)).mtimeMs]);
    await Bun.sleep(20);
    const second = await run();
    const after = readdirSync(cached).map((f) => [f, statSync(join(cached, f)).mtimeMs]);
    expect(after).toEqual(before);
    expect(second.get("foto.jpg")).toEqual(e as NonNullable<typeof e>);
    // dist limpo é repovoado a partir do cache
    rmSync(outDir, { recursive: true });
    await run();
    expect(imgFiles()).toHaveLength(9);
  });

  test("metadados EXIF são removidos", async () => {
    await makeJpeg("foto.jpg", 800, 400, true);
    expect((await sharp(join(srcDir, "foto.jpg")).metadata()).exif).toBeDefined();
    const e = (await run()).get("foto.jpg");
    for (const f of imgFiles()) {
      expect((await sharp(join(outDir, "_img", f)).metadata()).exif).toBeUndefined();
    }
    expect(e).toBeDefined();
  });

  test("arquivo corrompido lança SsgError com o caminho", async () => {
    writeFileSync(join(srcDir, "quebrada.png"), "isto não é uma imagem");
    const p = run();
    await expect(p).rejects.toBeInstanceOf(SsgError);
    await expect(run()).rejects.toThrow("quebrada.png");
  });

  test("diretório de origem inexistente gera manifesto vazio", async () => {
    srcDir = join(root, "nao-existe");
    expect((await run()).size).toBe(0);
  });

  test("generateOgImages gera JPEG de 1200px apenas para os paths pedidos", async () => {
    await makeJpeg("a.jpg", 2000, 1000);
    await makeJpeg("b.jpg", 800, 400);
    await makeJpeg("c.jpg", 2000, 1000);
    const manifest = await run();
    await generateOgImages(manifest, ["a.jpg", "b.jpg"], { srcDir, outDir, cacheDir, quality: 80 });
    const og = imgFiles().filter((f) => f.endsWith("-og.jpg"));
    expect(og).toHaveLength(2);
    const a = manifest.get("a.jpg");
    const b = manifest.get("b.jpg");
    expect(await sharp(join(outDir, "_img", `a-${a?.hash}-og.jpg`)).metadata()).toMatchObject({
      width: 1200,
      format: "jpeg",
    });
    expect((await sharp(join(outDir, "_img", `b-${b?.hash}-og.jpg`)).metadata()).width).toBe(800);
    expect(existsSync(join(outDir, "_img", `c-${manifest.get("c.jpg")?.hash}-og.jpg`))).toBe(false);
  });

  // Guarda "as dimensões vêm do arquivo real", não "o arredondamento diverge": uma busca (ver
  // .superpowers/sdd/.../minors-report.md, rodada 4) não achou nenhum tamanho em que a altura do sharp
  // difira de Math.round(1200 * h / w).
  test.each([
    [1999, 1333],
    [1999, 1001],
    [1301, 733],
    [3001, 2003],
    [800, 401],
  ])("generateOgImages devolve as dimensões lidas do JPEG gerado (%ix%i), também com o og já em cache", async (w, h) => {
    await makeJpeg("foto.jpg", w, h);
    const manifest = await run();
    const ogUrl = manifest.get("foto.jpg")?.ogUrl ?? "";
    const opts = { srcDir, outDir, cacheDir, quality: 80 };
    const first = await generateOgImages(manifest, ["foto.jpg"], opts);
    const real = await sharp(join(outDir, ogUrl)).metadata();
    expect(first.get(ogUrl)).toEqual({ width: real.width as number, height: real.height as number });
    expect(real.width).toBe(Math.min(1200, w));
    // Segunda execução (og vindo do cache) devolve as mesmas dimensões
    expect((await generateOgImages(manifest, ["foto.jpg"], opts)).get(ogUrl)).toEqual(first.get(ogUrl));
  });

  test("imagem que nenhuma página usa não ganha og, nem no cache nem em dist/", async () => {
    await makeJpeg("usada.jpg", 2000, 1000);
    await makeJpeg("ociosa.jpg", 2001, 1000);
    const manifest = await run();
    await generateOgImages(manifest, ["usada.jpg"], { srcDir, outDir, cacheDir, quality: 80 });
    const ociosa = manifest.get("ociosa.jpg");
    const usada = manifest.get("usada.jpg");
    const cached = (hash?: string) =>
      readdirSync(join(cacheDir, "images", hash ?? "")).filter((f) => f.includes("-og."));
    expect(cached(ociosa?.hash)).toEqual([]);
    expect(cached(usada?.hash)).toHaveLength(1);
    expect(imgFiles().filter((f) => f.includes("-og."))).toEqual([`usada-${usada?.hash}-og.jpg`]);
  });

  test.each([5, 6, 7, 8])("orientação EXIF %i troca largura e altura na saída e no manifesto", async (orientation) => {
    const buf = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#3366cc" } })
      .jpeg()
      .withMetadata({ orientation })
      .toBuffer();
    writeFileSync(join(srcDir, "girada.jpg"), buf);
    const e = (await run()).get("girada.jpg");
    expect(e).toMatchObject({ width: 400, height: 800 });
    // 400px de largura: só a variação do tamanho original
    expect(e?.variants.fallback.map((v) => v.width)).toEqual([400]);
    for (const f of imgFiles()) {
      const m = await sharp(join(outDir, "_img", f)).metadata();
      expect({ f, w: m.width, h: m.height }).toEqual({ f, w: 400, h: 800 });
    }
  });

  test("orientação EXIF 1 a 4 mantém largura e altura", async () => {
    for (const orientation of [1, 3]) {
      const buf = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#3366cc" } })
        .jpeg()
        .withMetadata({ orientation })
        .toBuffer();
      writeFileSync(join(srcDir, `o${orientation}.jpg`), buf);
    }
    const manifest = await run();
    expect(manifest.get("o1.jpg")).toMatchObject({ width: 800, height: 400 });
    expect(manifest.get("o3.jpg")).toMatchObject({ width: 800, height: 400 });
  });

  test("entrada CMYK é convertida para sRGB em todas as variantes", async () => {
    const buf = await sharp({ create: { width: 600, height: 300, channels: 3, background: "#3366cc" } })
      .toColorspace("cmyk")
      .jpeg()
      .toBuffer();
    writeFileSync(join(srcDir, "cmyk.jpg"), buf);
    expect((await sharp(join(srcDir, "cmyk.jpg")).metadata()).space).toBe("cmyk");
    await run();
    const files = imgFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect((await sharp(join(outDir, "_img", f)).metadata()).space).toBe("srgb");
    }
  });

  test.each(["foto.bmp", "notas.txt"])("extensão não suportada (%s) lança SsgError com o caminho", async (name) => {
    writeFileSync(join(srcDir, name), "conteúdo qualquer");
    const err = await run().then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(SsgError);
    expect((err as Error).message).toContain(name);
  });

  test("GIF é passthrough com width e height", async () => {
    const gif = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#ff0000" } })
      .gif()
      .toBuffer();
    writeFileSync(join(srcDir, "anim.gif"), gif);
    const e = (await run()).get("anim.gif");
    expect(e).toMatchObject({ kind: "passthrough", width: 30, height: 20, format: "gif" });
    expect(e?.variants).toEqual({ avif: [], webp: [], fallback: [] });
    expect(e?.url).toBe(`/_img/anim-${e?.hash}.gif`);
    expect(existsSync(join(outDir, e?.url ?? ""))).toBe(true);
  });

  test("nome sem caracteres ASCII usa o slug de fallback img", async () => {
    await makePng("日本.png", 500, 250);
    const e = (await run()).get("日本.png");
    expect(e?.variants.fallback[0]?.url).toBe(`/_img/img-${e?.hash}-480.png`);
  });

  test("entradas idênticas com o mesmo slug são processadas uma vez e ficam em entradas distintas", async () => {
    await makePng("日本.png", 500, 250);
    await makePng("中国.png", 500, 250);
    const manifest = await run();
    const a = manifest.get("日本.png");
    const b = manifest.get("中国.png");
    expect(a?.path).toBe("日本.png");
    expect(b?.path).toBe("中国.png");
    expect(a?.hash).toBe(b?.hash);
    expect(a?.variants).toEqual(b?.variants);
    expect(a).not.toBe(b);
    // um único conjunto de arquivos (3 formatos x [480, 500]) e um único meta no cache
    expect(imgFiles()).toHaveLength(6);
    expect(readdirSync(join(cacheDir, "images", a?.hash ?? "")).filter((f) => f.endsWith(".json"))).toEqual([
      "img.json",
    ]);
  });

  test("nome em NFD vira chave NFC no manifesto e o og é gerado a partir do arquivo em disco", async () => {
    const nfd = "clínica.jpg".normalize("NFD");
    await makeJpeg(nfd, 1600, 800);
    const manifest = await run();
    const key = "clínica.jpg".normalize("NFC");
    expect([...manifest.keys()]).toEqual([key]);
    expect(manifest.get(key)?.path).toBe(key);
    await generateOgImages(manifest, [key], { srcDir, outDir, cacheDir, quality: 80 });
    expect(existsSync(join(outDir, manifest.get(key)?.ogUrl ?? ""))).toBe(true);
    expect(imgFiles().filter((f) => f.endsWith("-og.jpg"))).toHaveLength(1);
  });
});

describe("pool", () => {
  test("na primeira falha não inicia trabalho novo e espera os que estavam em andamento", async () => {
    const started: number[] = [];
    let slowFinished = false;
    const err = await pool([1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n);
      if (n === 1) throw new Error("falhou");
      await Bun.sleep(50);
      slowFinished = true;
    }).then(
      () => null,
      (e) => e,
    );
    expect((err as Error).message).toBe("falhou");
    expect(started).toEqual([1, 2]);
    // a rejeição só chegou depois de o item em andamento terminar
    expect(slowFinished).toBe(true);
  });

  test("sem falhas processa todos respeitando o limite", async () => {
    let active = 0;
    let peak = 0;
    await pool([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      peak = Math.max(peak, active);
      await Bun.sleep(5);
      active--;
    });
    expect(peak).toBe(2);
  });
});
