import { afterEach, describe, expect, spyOn, test } from "bun:test";

// Dynamic import: imports estáticos são hoisted e rodariam antes da flag
(globalThis as { __DEV__?: boolean }).__DEV__ = true;
const { mountIslands } = await import("./islands-client");

describe("islands-client", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  afterEach(() => warn.mockClear());

  test("ilha não registrada só avisa e não altera o elemento", () => {
    let replaced = 0;
    const el = {
      getAttribute: (n: string) => (n === "data-island" ? "fantasma" : null),
      replaceChildren: () => {
        replaced++;
      },
    };
    const root = { querySelectorAll: () => [el] } as unknown as ParentNode;
    mountIslands({}, root);
    expect(replaced).toBe(0);
    expect(warn).toHaveBeenCalledWith("[slash-ssg] ilha não registrada: fantasma");
  });
});

describe("islands-client: falhas isoladas", () => {
  const error = spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => error.mockClear());

  const fakeEl = (name: string, props?: string) => {
    const original = [{ id: "html-do-servidor" }];
    const probe = { calls: 0 };
    const el = {
      childNodes: original as unknown[],
      getAttribute: (n: string) => (n === "data-island" ? name : n === "data-props" ? (props ?? null) : null),
      replaceChildren(...nodes: unknown[]) {
        probe.calls++;
        el.childNodes = nodes;
      },
    };
    return {
      el,
      original,
      get calls() {
        return probe.calls;
      },
    };
  };

  test("componente que lança preserva o HTML do servidor, registra o erro e segue para a próxima ilha", () => {
    const a = fakeEl("quebra");
    const b = fakeEl("ok");
    const root = { querySelectorAll: () => [a.el, b.el] } as unknown as ParentNode;
    mountIslands(
      {
        quebra: () => {
          throw new Error("boom");
        },
        ok: () => null,
      },
      root,
    );
    expect(a.el.childNodes).toEqual(a.original);
    expect((error.mock.calls[0] as unknown[])[0]).toBe("[slash-ssg] falha ao montar ilha quebra");
    // A segunda ilha foi processada depois da falha da primeira: o elemento dela foi limpo (1ª chamada de
    // replaceChildren) antes do render. Como o elemento falso não é um nó real, o render falha e o HTML é
    // restaurado; a montagem de verdade da ilha seguinte é provada em islands-dom.test.ts (happy-dom).
    expect(b.calls).toBeGreaterThanOrEqual(1);
    expect(b.el.childNodes).toEqual(b.original);
    expect(error.mock.calls.map((c) => (c as unknown[])[0])).toContain("[slash-ssg] falha ao montar ilha ok");
  });

  test("props inválidas não limpam a ilha", () => {
    const a = fakeEl("x", "{nao-json");
    const root = { querySelectorAll: () => [a.el] } as unknown as ParentNode;
    mountIslands({ x: () => null }, root);
    expect(a.el.childNodes).toEqual(a.original);
  });
});
