import { describe, expect, test } from "bun:test";
import { SsgError } from "./errors";
import { islandWrapper, parseIslandProps, serializeProps } from "./island-core";

// Desfaz o escape de atributo, como o parser do browser faz
const decodeAttr = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

describe("island-core", () => {
  test("props sobrevivem ida e volta com caracteres especiais", () => {
    const props = { a: `it's "x" & </script> 🚀 ção`, n: [1, { b: null }] };
    const html = islandWrapper("c", serializeProps("c", props), "<p>x</p>");
    expect(html.startsWith('<div data-island="c" data-props="')).toBe(true);
    expect(html.endsWith("<p>x</p></div>")).toBe(true);
    const raw = decodeAttr(html.match(/data-props="([^"]*)"/)?.[1] ?? "");
    expect(parseIslandProps(raw)).toEqual(props);
  });

  test("função em props lança SsgError com nome da ilha e caminho", () => {
    const run = () => serializeProps("gallery", { items: [{ onClick: () => 1 }] });
    expect(run).toThrow(SsgError);
    expect(run).toThrow("gallery");
    expect(run).toThrow("props.items[0].onClick");
  });

  test("undefined em profundidade lança SsgError com caminho", () => {
    expect(() => serializeProps("x", { a: { b: undefined } })).toThrow("props.a.b");
  });

  test("symbol e bigint lançam SsgError", () => {
    expect(() => serializeProps("x", { s: Symbol("a") })).toThrow(SsgError);
    expect(() => serializeProps("x", { n: 1n })).toThrow(SsgError);
  });

  test("ciclo em props lança SsgError", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => serializeProps("x", a)).toThrow(SsgError);
  });

  test("referência compartilhada sem ciclo é aceita", () => {
    const shared = { v: 1 };
    expect(serializeProps("x", { a: shared, b: shared })).toBe('{"a":{"v":1},"b":{"v":1}}');
  });

  test("Date em props lança SsgError", () => {
    expect(() => serializeProps("x", { d: new Date() })).toThrow(SsgError);
  });

  test("objeto sem protótipo é aceito", () => {
    const o = Object.create(null);
    o.a = 1;
    expect(serializeProps("x", o)).toBe('{"a":1}');
  });

  test("NaN, Infinity e -Infinity lançam SsgError com o caminho da chave", () => {
    expect(() => serializeProps("x", { a: { n: Number.NaN } })).toThrow("props.a.n");
    expect(() => serializeProps("x", { a: Number.POSITIVE_INFINITY })).toThrow(SsgError);
    expect(() => serializeProps("x", { l: [1, Number.NEGATIVE_INFINITY] })).toThrow("props.l[1]");
    expect(() => serializeProps("x", { a: Number.NaN })).toThrow("NaN");
  });

  test("buraco em array esparso lança SsgError com o índice", () => {
    // biome-ignore lint/suspicious/noSparseArray: o buraco é o objeto do teste
    const sparse = [1, , 3];
    expect(() => serializeProps("x", { items: sparse })).toThrow(SsgError);
    expect(() => serializeProps("x", { items: sparse })).toThrow("props.items[1]");
  });

  test("zero, -0 e números finitos grandes são aceitos", () => {
    expect(serializeProps("x", { a: 0, b: -0, c: 1e300 })).toBe('{"a":0,"b":0,"c":1e+300}');
  });

  test("parseIslandProps vazio retorna {}", () => {
    expect(parseIslandProps(undefined)).toEqual({});
    expect(parseIslandProps("")).toEqual({});
  });
});
