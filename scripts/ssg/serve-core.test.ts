import { expect, test } from "bun:test";
import { parsePort, renderErrorPage, resolveRequest } from "./serve-core";

const files = new Set(["index.html", "sobre/index.html", "404.html", "_img/a.avif"]);
const exists = (f: string) => files.has(f);
const resolveUrl = (u: string) => resolveRequest(new URL(u, "http://localhost:4000"), exists);

test("/sobre/ serve sobre/index.html", () => {
  expect(resolveUrl("/sobre/")).toEqual({ kind: "file", file: "sobre/index.html", status: 200 });
});

test("/sobre/?utm_source=insta serve sobre/index.html", () => {
  expect(resolveUrl("/sobre/?utm_source=insta")).toEqual({ kind: "file", file: "sobre/index.html", status: 200 });
});

test("/sobre?utm=x redireciona para /sobre/?utm=x", () => {
  expect(resolveUrl("/sobre?utm=x")).toEqual({ kind: "redirect", location: "/sobre/?utm=x" });
});

test("/ serve index.html", () => {
  expect(resolveUrl("/")).toEqual({ kind: "file", file: "index.html", status: 200 });
});

test("caminho inexistente serve 404.html com status 404", () => {
  expect(resolveUrl("/nada/")).toEqual({ kind: "file", file: "404.html", status: 404 });
  expect(resolveUrl("/nada")).toEqual({ kind: "file", file: "404.html", status: 404 });
});

test("arquivo estático existente é servido", () => {
  expect(resolveUrl("/_img/a.avif")).toEqual({ kind: "file", file: "_img/a.avif", status: 200 });
});

test("path traversal não escapa de dist", () => {
  expect(resolveRequest(new URL("http://localhost:4000/..%2f..%2fetc/passwd"), () => true)).toEqual({
    kind: "file",
    file: "404.html",
    status: 404,
  });
});

test("renderErrorPage escapa a mensagem", () => {
  const html = renderErrorPage("<script>alert(1)</script> & co");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co");
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).toContain("EventSource");
});

test("renderErrorPage usa o idioma informado", () => {
  expect(renderErrorPage("x", "en")).toContain('<html lang="en">');
  expect(renderErrorPage("x")).toContain('<html lang="pt-BR">');
});

test("parsePort: ausente ou vazia usa 4000", () => {
  expect(parsePort(undefined)).toBe(4000);
  expect(parsePort("")).toBe(4000);
  expect(parsePort("  ")).toBe(4000);
});

test("parsePort: aceita inteiros de 1 a 65535", () => {
  expect(parsePort("1")).toBe(1);
  expect(parsePort("4100")).toBe(4100);
  expect(parsePort("65535")).toBe(65535);
});

test.each(["abc", "0", "-1", "65536", "1.5", "4e3", "0x10", "80 80", "NaN"])("parsePort: %p é inválida", (raw) => {
  expect(() => parsePort(raw)).toThrow(`PORT inválida: "${raw}"`);
});
