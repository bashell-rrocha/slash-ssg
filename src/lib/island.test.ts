import { describe, expect, test } from "bun:test";
import { unsafeHtml } from "@_bashell/slash/ssr";
import { island } from "./island";

const out = (name: string, inner: unknown, props: unknown = {}) =>
  island(name, () => inner, props).value;

describe("island", () => {
  test("nome e props hostis saem inertes", () => {
    const props = { a: '</script><!--"\'', b: "a b", c: "<img src=x onerror=alert(1)>" };
    const html = out('"><script>alert(1)</script>', unsafeHtml("<p>ok</p>"), props);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<!--");
    // todos os atributos continuam dentro das aspas: só data-island e data-props
    expect(html.match(/ [a-z-]+="/g)).toEqual([' data-island="', ' data-props="']);
    expect(html.startsWith("<div data-island=\"&quot;&gt;&lt;script&gt;")).toBe(true);
    expect(html).toContain("<p>ok</p>");
  });

  test("string comum como conteúdo é escapada", () => {
    const html = out("x", "<b onclick=1>oi</b>");
    expect(html).toContain("&lt;b onclick=1&gt;oi&lt;/b&gt;");
    expect(html).not.toContain("<b");
  });

  test("SafeHtml passa como está", () => {
    expect(out("x", unsafeHtml("<b>oi</b>"))).toBe(
      '<div data-island="x" data-props="{}"><b>oi</b></div>',
    );
  });

  test("array junta as partes com o mesmo escape dos filhos", () => {
    const html = out("x", [unsafeHtml("<i>a</i>"), "<u>", null, false, 3]);
    expect(html).toBe('<div data-island="x" data-props="{}"><i>a</i>&lt;u&gt;3</div>');
  });
});
