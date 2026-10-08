import { describe, expect, test } from "bun:test";
import { SsgError } from "./errors";
import { assertShell, renderDocument } from "./render-page";

const shell = "<html><head><!--slash:head--></head><body><!--slash:app--></body></html>";
const script = '<script type="module" src="/c.js"></script>';

describe("render-page", () => {
  test("substitui os dois marcadores", () => {
    const out = renderDocument({ shell, head: "<title>T</title>", body: "<p>x</p>", scriptSrc: null, lang: "pt-BR" });
    expect(out).toBe('<html lang="pt-BR"><head><title>T</title></head><body><p>x</p></body></html>');
  });

  test("conteúdo com padrões de substituição ($&) é inserido literalmente", () => {
    const out = renderDocument({ shell, head: "", body: "<p>$& $1 $$</p>", scriptSrc: null, lang: "pt-BR" });
    expect(out).toContain("<p>$& $1 $$</p>");
  });

  test("marcador dentro de head.extra não captura o corpo", () => {
    const out = renderDocument({
      shell,
      head: "<!--slash:app-->",
      body: "<p>corpo</p>",
      scriptSrc: null,
      lang: "pt-BR",
    });
    expect(out).toBe('<html lang="pt-BR"><head><!--slash:app--></head><body><p>corpo</p></body></html>');
  });

  test("marcador de head dentro do corpo também não é re-substituído", () => {
    const out = renderDocument({ shell, head: "<b>h</b>", body: "<!--slash:head-->", scriptSrc: null, lang: "pt-BR" });
    expect(out).toBe('<html lang="pt-BR"><head><b>h</b></head><body><!--slash:head--></body></html>');
  });

  test("inclui script quando há data-island", () => {
    const out = renderDocument({
      shell,
      head: "",
      body: '<div data-island="a"></div>',
      scriptSrc: "/c.js",
      lang: "pt-BR",
    });
    expect(out).toContain(`${script}</body>`);
  });

  test("omite script sem data-island", () => {
    expect(renderDocument({ shell, head: "", body: "<p>x</p>", scriptSrc: "/c.js", lang: "pt-BR" })).not.toContain(
      "<script",
    );
  });

  test("omite script quando scriptSrc é null", () => {
    const out = renderDocument({
      shell,
      head: "",
      body: '<div data-island="a"></div>',
      scriptSrc: null,
      lang: "pt-BR",
    });
    expect(out).not.toContain("<script");
  });

  test("lang vem do site: substitui o lang da casca, preserva outros atributos e adiciona quando falta", () => {
    const doc = (sh: string, lang: string) => renderDocument({ shell: sh, head: "", body: "", scriptSrc: null, lang });
    expect(doc(`<html lang="pt-BR" class="a">${shell.slice(6)}`, "en")).toContain('<html lang="en" class="a">');
    expect(doc(`<html class="a">${shell.slice(6)}`, "es")).toContain('<html lang="es" class="a">');
    expect(doc(shell, 'x"y')).toContain('<html lang="x&quot;y">');
  });

  test("shell sem marcador lança SsgError citando o marcador", () => {
    expect(() => assertShell("<html><!--slash:app--></html>")).toThrow(SsgError);
    expect(() => assertShell("<html><!--slash:app--></html>")).toThrow("<!--slash:head-->");
    expect(() => assertShell("<html><!--slash:head--></html>")).toThrow("<!--slash:app-->");
    expect(() => assertShell(shell)).not.toThrow();
  });
});
