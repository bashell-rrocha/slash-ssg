import { describe, expect, test } from "bun:test";
import { renderHead, resolveTitle } from "./head-core";
import type { SiteConfig } from "./types";

const site: SiteConfig = {
  name: "Site",
  baseUrl: "https://ex.com",
  lang: "pt-BR",
  defaultHead: { description: "Descrição padrão" },
};
const base = { site, url: "/sobre/", cssHrefs: [], devReload: false };

describe("head-core", () => {
  test("título recebe sufixo do site, exceto quando igual ao nome", () => {
    expect(resolveTitle("Sobre", "Site")).toBe("Sobre | Site");
    expect(resolveTitle("Site", "Site")).toBe("Site");
    expect(renderHead({ ...base, head: { title: "Sobre" } })).toContain("<title>Sobre | Site</title>");
  });

  test("description usa o default do site quando ausente", () => {
    const out = renderHead({ ...base, head: { title: "A" } });
    expect(out).toContain('<meta name="description" content="Descrição padrão">');
  });

  test("canonical default é absoluto", () => {
    const out = renderHead({ ...base, head: { title: "A" } });
    expect(out).toContain('<link rel="canonical" href="https://ex.com/sobre/">');
    expect(out).toContain('<meta property="og:url" content="https://ex.com/sobre/">');
  });

  test("canonical explícito vence o default", () => {
    const out = renderHead({
      ...base,
      head: { title: "A", canonical: "https://outro.com/x/" },
    });
    expect(out).toContain('<link rel="canonical" href="https://outro.com/x/">');
    expect(out).not.toContain("https://ex.com/sobre/");
  });

  test("og e twitter com imagem", () => {
    const out = renderHead({
      ...base,
      head: { title: "A" },
      ogImage: { url: "https://ex.com/_img/a.jpg" },
    });
    expect(out).toContain('<meta property="og:image" content="https://ex.com/_img/a.jpg">');
    expect(out).toContain('<meta property="og:type" content="website">');
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  test("imagem local raster emite og:image:width, height e type", () => {
    const out = renderHead({
      ...base,
      head: { title: "A" },
      ogImage: { url: "https://ex.com/_img/a-og.jpg", width: 1200, height: 630, type: "image/jpeg" },
    });
    expect(out).toContain('<meta property="og:image:width" content="1200">');
    expect(out).toContain('<meta property="og:image:height" content="630">');
    expect(out).toContain('<meta property="og:image:type" content="image/jpeg">');
    expect(out).not.toContain("image:alt");
  });

  test("imageAlt gera og:image:alt e twitter:image:alt escapados, só com imagem", () => {
    const withImage = renderHead({
      ...base,
      head: { title: "A", imageAlt: 'Foto "x" & y' },
      ogImage: { url: "https://ex.com/a.jpg" },
    });
    expect(withImage).toContain('<meta property="og:image:alt" content="Foto &quot;x&quot; &amp; y">');
    expect(withImage).toContain('<meta name="twitter:image:alt" content="Foto &quot;x&quot; &amp; y">');
    expect(withImage).not.toContain("og:image:width");
    expect(renderHead({ ...base, head: { title: "A", imageAlt: "x" } })).not.toContain("image:alt");
  });

  test("sem imagem usa twitter summary e omite og:image", () => {
    const out = renderHead({ ...base, head: { title: "A" } });
    expect(out).toContain('<meta name="twitter:card" content="summary">');
    expect(out).not.toContain("og:image");
  });

  test("noindex gera meta robots", () => {
    expect(renderHead({ ...base, head: { title: "A", noindex: true } })).toContain(
      '<meta name="robots" content="noindex">',
    );
    expect(renderHead({ ...base, head: { title: "A" } })).not.toContain("robots");
  });

  test("noindex omite canonical e og:url", () => {
    const out = renderHead({ ...base, head: { title: "A", noindex: true, canonical: "https://ex.com/x/" } });
    expect(out).not.toContain("canonical");
    expect(out).not.toContain("og:url");
  });

  test("og:site_name usa o nome do site (escapado) em toda página", () => {
    expect(renderHead({ ...base, head: { title: "A" } })).toContain('<meta property="og:site_name" content="Site">');
    const out = renderHead({ ...base, site: { ...site, name: "A & B" }, head: { title: "A", noindex: true } });
    expect(out).toContain('<meta property="og:site_name" content="A &amp; B">');
  });

  test("jsonLd em array gera um script por item e escapa </script>", () => {
    const out = renderHead({
      ...base,
      head: { title: "A", jsonLd: [{ a: "</script><b>" }, { b: 1 }] },
    });
    expect(out.match(/<script type="application\/ld\+json">/g)?.length).toBe(2);
    expect(out).not.toContain("</script><b>");
    expect(out).toContain("\\u003c/script>");
  });

  test("extra entra cru e CSS vira link stylesheet", () => {
    const out = renderHead({
      ...base,
      head: { title: "A", extra: '<meta name="x" content="y">' },
      cssHrefs: ["/a.css"],
    });
    expect(out).toContain('<meta name="x" content="y">');
    expect(out).toContain('<link rel="stylesheet" href="/a.css">');
  });

  test("escapa caracteres especiais e preserva acentos", () => {
    const out = renderHead({
      head: { title: `Clínicas & Saúde "Premium" <2026>` },
      site,
      url: "/",
      cssHrefs: [],
      devReload: false,
    });
    expect(out).toContain("Clínicas &amp; Saúde &quot;Premium&quot; &lt;2026&gt;");
  });

  test("devReload injeta o EventSource apenas quando true", () => {
    const on = renderHead({ ...base, head: { title: "A" }, devReload: true });
    const off = renderHead({ ...base, head: { title: "A" } });
    expect(on).toContain('new EventSource("/__reload")');
    expect(off).not.toContain("EventSource");
  });
});
