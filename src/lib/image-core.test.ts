import { describe, expect, test } from "bun:test";
import { SsgError } from "./errors";
import {
  buildDescriptor,
  fallbackFormat,
  fillOgTokens,
  hasOgToken,
  type ManifestEntry,
  ogToken,
  pictureModel,
  resolveImagesConfig,
  selectWidths,
  slugifyImagePath,
  validateAlt,
  variantUrl,
} from "./image-core";

const v = (w: number, ext: string) => ({ width: w, url: `/_img/foto-abc12345-${w}.${ext}` });

const raster: ManifestEntry = {
  path: "foto.jpg",
  kind: "raster",
  hash: "abc12345",
  width: 2000,
  height: 1000,
  format: "jpeg",
  hasAlpha: false,
  variants: {
    avif: [480, 960, 1440].map((w) => v(w, "avif")),
    webp: [480, 960, 1440].map((w) => v(w, "webp")),
    fallback: [480, 960, 1440].map((w) => v(w, "jpg")),
  },
  ogUrl: "/_img/foto-abc12345-og.jpg",
};

const passthrough: ManifestEntry = {
  path: "logo.svg",
  kind: "passthrough",
  hash: "abc12345",
  width: 100,
  height: 50,
  format: "svg",
  hasAlpha: true,
  variants: { avif: [], webp: [], fallback: [] },
  url: "/_img/logo-abc12345.svg",
};

describe("image-core", () => {
  test("resolveImagesConfig aplica defaults e sobrescritas parciais", () => {
    expect(resolveImagesConfig()).toEqual({
      widths: [480, 960, 1440, 1920],
      quality: { avif: 50, webp: 75, jpeg: 80 },
    });
    const c = resolveImagesConfig({ widths: [300], quality: { webp: 60 } });
    expect(c.widths).toEqual([300]);
    expect(c.quality).toEqual({ avif: 50, webp: 60, jpeg: 80 });
  });

  test("selectWidths não amplia", () => {
    expect(selectWidths(1200, [480, 960, 1440, 1920])).toEqual([480, 960, 1200]);
    expect(selectWidths(3000, [480, 960, 1440, 1920])).toEqual([480, 960, 1440, 1920]);
    expect(selectWidths(300, [480, 960])).toEqual([300]);
    expect(selectWidths(960, [960, 480, 960])).toEqual([480, 960]);
  });

  test("fallbackFormat por formato e alfa", () => {
    expect(fallbackFormat("jpeg", false)).toBe("jpeg");
    expect(fallbackFormat("jpg", true)).toBe("jpeg");
    expect(fallbackFormat("png", true)).toBe("png");
    expect(fallbackFormat("png", false)).toBe("jpeg");
    expect(fallbackFormat("webp", true)).toBe("png");
    expect(fallbackFormat("avif", false)).toBe("jpeg");
  });

  test("slugifyImagePath normaliza acentos, espaços, maiúsculas e extensão", () => {
    expect(slugifyImagePath("mockups/Mockup Clínica.PNG")).toBe("mockups-mockup-clinica");
    expect(slugifyImagePath("a/b/../Foto__1.jpg")).toBe("a-b-foto-1");
    expect(slugifyImagePath("-x-.png")).toBe("x");
  });

  test("slugifyImagePath que resultaria vazio usa o fallback img", () => {
    expect(slugifyImagePath("日本.png")).toBe("img");
    expect(slugifyImagePath("__.png")).toBe("img");
    expect(slugifyImagePath("fotos/日本.png")).toBe("fotos");
  });

  test("slugifyImagePath trata NFD e NFC igual", () => {
    expect(slugifyImagePath("Clínica.png".normalize("NFD"))).toBe(slugifyImagePath("Clínica.png".normalize("NFC")));
  });

  test("tokens og são trocados pelas dimensões reais e token desconhecido é erro", () => {
    const url = "/_img/a-abc12345-og.jpg";
    const html = `<meta content="${ogToken(url, "width")}"><meta content="${ogToken(url, "height")}">`;
    expect(hasOgToken(html)).toBe(true);
    const out = fillOgTokens(html, new Map([[url, { width: 1200, height: 800 }]]), "/");
    expect(out).toBe('<meta content="1200"><meta content="800">');
    expect(hasOgToken(out)).toBe(false);
    expect(() => fillOgTokens(html, new Map(), "/x/")).toThrow("/_img/a-abc12345-og.jpg");
  });

  test("variantUrl monta a URL com largura ou og", () => {
    expect(variantUrl("foto", "abc12345", 480, "webp")).toBe("/_img/foto-abc12345-480.webp");
    expect(variantUrl("foto", "abc12345", "og", "jpg")).toBe("/_img/foto-abc12345-og.jpg");
  });

  test("validateAlt aceita string vazia e rejeita ausente", () => {
    expect(validateAlt("", "foto.jpg")).toBe("");
    expect(validateAlt("texto", "foto.jpg")).toBe("texto");
    expect(() => validateAlt(undefined, "foto.jpg")).toThrow(SsgError);
    expect(() => validateAlt(undefined, "foto.jpg")).toThrow("foto.jpg");
    expect(() => validateAlt(3, "foto.jpg")).toThrow(SsgError);
  });

  test("buildDescriptor escolhe src mais próximo de 960 e ordena avif, webp", () => {
    const d = buildDescriptor(raster, "Uma foto");
    expect(d.src).toBe("/_img/foto-abc12345-960.jpg");
    expect(d.sources.map((s) => s.type)).toEqual(["image/avif", "image/webp"]);
    expect(d.sources[0]?.srcset).toBe(
      "/_img/foto-abc12345-480.avif 480w, /_img/foto-abc12345-960.avif 960w, /_img/foto-abc12345-1440.avif 1440w",
    );
    expect(d.fallbackSrcset).toContain("/_img/foto-abc12345-1440.jpg 1440w");
    expect(d).toMatchObject({ alt: "Uma foto", width: 2000, height: 1000 });
  });

  test("buildDescriptor de passthrough", () => {
    const d = buildDescriptor(passthrough, "Logo");
    expect(d.src).toBe("/_img/logo-abc12345.svg");
    expect(d.sources).toEqual([]);
    expect(d.fallbackSrcset).toBe("");
  });

  test("descriptor é serializável (JSON ida e volta igual)", () => {
    const d = buildDescriptor(raster, "x");
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  test("pictureModel lazy por padrão e eager+fetchpriority com priority", () => {
    const d = buildDescriptor(raster, "x");
    const lazy = pictureModel(d);
    expect(lazy.img).toMatchObject({
      src: d.src,
      srcset: d.fallbackSrcset,
      sizes: "100vw",
      width: "2000",
      height: "1000",
      alt: "x",
      decoding: "async",
      loading: "lazy",
    });
    expect(lazy.img.fetchpriority).toBeUndefined();
    expect(lazy.img.class).toBeUndefined();
    expect(lazy.sources[0]).toMatchObject({ type: "image/avif", sizes: "100vw" });

    const eager = pictureModel(d, { priority: true, sizes: "50vw", class: "hero" });
    expect(eager.img).toMatchObject({ loading: "eager", fetchpriority: "high", sizes: "50vw", class: "hero" });
    expect(eager.sources[1]?.sizes).toBe("50vw");
  });

  test("pictureModel passthrough sem sources nem srcset", () => {
    const m = pictureModel(buildDescriptor(passthrough, "Logo"));
    expect(m.sources).toEqual([]);
    expect(m.img.srcset).toBeUndefined();
    expect(m.img.sizes).toBeUndefined();
    expect(m.img).toMatchObject({ src: "/_img/logo-abc12345.svg", width: "100", height: "50", loading: "lazy" });
  });
});
