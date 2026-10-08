import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SsgError } from "./errors";
import { image, Picture, resolveOgImage, setImageManifest, takeOgRequests } from "./image";
import type { ManifestEntry } from "./image-core";

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
    avif: [v(480, "avif"), v(960, "avif")],
    webp: [v(480, "webp"), v(960, "webp")],
    fallback: [v(480, "jpg"), v(960, "jpg")],
  },
  ogUrl: "/_img/foto-abc12345-og.jpg",
};

const svg: ManifestEntry = {
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

beforeEach(() => {
  setImageManifest(
    new Map([
      ["foto.jpg", raster],
      ["logo.svg", svg],
    ]),
  );
  takeOgRequests();
});
afterEach(() => setImageManifest(null));

describe("image", () => {
  test("image() sem manifesto lança erro explicativo", () => {
    setImageManifest(null);
    expect(() => image("foto.jpg", { alt: "x" })).toThrow("image() só pode ser chamado durante o build");
  });

  test("image() com path inexistente lança SsgError", () => {
    expect(() => image("nao-existe.jpg", { alt: "x" })).toThrow(SsgError);
    expect(() => image("nao-existe.jpg", { alt: "x" })).toThrow("nao-existe.jpg");
  });

  test("image() sem alt lança SsgError com o path", () => {
    expect(() => image("foto.jpg", {} as { alt: string })).toThrow("foto.jpg");
  });

  test("Picture gera picture com sources avif/webp e img com width/height", () => {
    const out = String(Picture(image("foto.jpg", { alt: 'Uma "foto"' }), { class: "hero" }));
    expect(out).toStartWith("<picture>");
    expect(out.indexOf('type="image/avif"')).toBeLessThan(out.indexOf('type="image/webp"'));
    expect(out).toContain('srcset="/_img/foto-abc12345-480.avif 480w, /_img/foto-abc12345-960.avif 960w"');
    expect(out).toContain('sizes="100vw"');
    expect(out).toContain('width="2000"');
    expect(out).toContain('height="1000"');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('class="hero"');
    expect(out).toContain('src="/_img/foto-abc12345-960.jpg"');
    expect(out).toContain('alt="Uma &quot;foto&quot;"');
  });

  test("Picture com priority usa eager e fetchpriority", () => {
    const out = String(Picture(image("foto.jpg", { alt: "" }), { priority: true }));
    expect(out).toContain('loading="eager"');
    expect(out).toContain('fetchpriority="high"');
  });

  test("Picture em passthrough gera só img", () => {
    const out = String(Picture(image("logo.svg", { alt: "Logo" })));
    expect(out).toStartWith("<img");
    expect(out).not.toContain("<picture");
    expect(out).not.toContain("srcset");
    expect(out).toContain('src="/_img/logo-abc12345.svg"');
    expect(out).toContain('width="100"');
  });

  test("resolveOgImage registra pedido para path local e não para URL absoluta", () => {
    expect(resolveOgImage("https://cdn.x/og.png", "https://x.com")).toEqual({ url: "https://cdn.x/og.png" });
    expect(resolveOgImage("/og.png", "https://x.com/")).toEqual({ url: "https://x.com/og.png" });
    expect(resolveOgImage(undefined, "https://x.com")).toBeUndefined();
    expect(takeOgRequests()).toEqual([]);
    expect(resolveOgImage("foto.jpg", "https://x.com")).toEqual({
      url: "https://x.com/_img/foto-abc12345-og.jpg",
      width: "__SLASH_OG_W[/_img/foto-abc12345-og.jpg]__",
      height: "__SLASH_OG_H[/_img/foto-abc12345-og.jpg]__",
      type: "image/jpeg",
    });
    expect(takeOgRequests()).toEqual(["foto.jpg"]);
    expect(takeOgRequests()).toEqual([]);
  });

  test("resolveOgImage de passthrough usa o arquivo e não registra pedido", () => {
    expect(resolveOgImage("logo.svg", "https://x.com")).toEqual({ url: "https://x.com/_img/logo-abc12345.svg" });
    expect(takeOgRequests()).toEqual([]);
  });

  test("caminho em NFD acha a chave NFC em image() e resolveOgImage()", () => {
    const nfc = "clínica.jpg".normalize("NFC");
    const nfd = "clínica.jpg".normalize("NFD");
    expect(nfc).not.toBe(nfd);
    setImageManifest(new Map([[nfc, { ...raster, path: nfc }]]));
    expect(image(nfd, { alt: "x" }).width).toBe(2000);
    expect(resolveOgImage(nfd, "https://x.com")?.url).toBe("https://x.com/_img/foto-abc12345-og.jpg");
    expect(takeOgRequests()).toEqual([nfc]);
  });

  test("resolveOgImage com path inexistente lança SsgError", () => {
    expect(() => resolveOgImage("nada.jpg", "https://x.com")).toThrow(SsgError);
  });
});
