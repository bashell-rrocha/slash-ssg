import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// DOM real (happy-dom) registrado só neste arquivo. Os demais testes dependem de
// typeof document === "undefined"; o registro é desfeito em afterAll e os módulos que escolhem
// o renderer por document (renderer.ts) são importados dinamicamente, depois do registro.
let mountIslands: typeof import("./islands-client").mountIslands;
let createState: typeof import("@_bashell/slash/core").createState;
let reactiveView: typeof import("./renderer").reactiveView;
let view: typeof import("./renderer").view;

beforeAll(async () => {
  GlobalRegistrator.register();
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  // Instâncias novas ("?dom"), avaliadas com document já presente
  ({ createState } = await import("@_bashell/slash/core"));
  // Especificador em variável: o TypeScript não resolve sufixos de query, o Bun sim
  const fresh = <T>(path: string): Promise<T> => import(`${path}?dom`);
  ({ reactiveView, view } = await fresh<typeof import("./renderer")>("./renderer"));
  ({ mountIslands } = await fresh<typeof import("./islands-client")>("./islands-client"));
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

function page(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe("mountIslands com DOM real", () => {
  test("ilha com reactiveView + createState atualiza ao clicar sem perder o estado", async () => {
    const Counter = (props: { start: number }) => {
      const count = createState(props.start);
      return reactiveView(
        () => view`<button type="button" onClick=${() => count.set(count.get() + 1)}>Contador: ${count.get()}</button>`,
      );
    };
    const root = page(
      '<div data-island="counter" data-props="{&quot;start&quot;:3}"><button type="button">Contador: 3</button></div>',
    );
    mountIslands({ counter: Counter }, root);
    const button = () => root.querySelector("button") as HTMLButtonElement;
    expect(button().textContent).toBe("Contador: 3");

    button().click();
    await flush();
    expect(button().textContent).toBe("Contador: 4");
    button().click();
    button().click();
    await flush();
    // O estado não voltou ao inicial a cada re-render
    expect(button().textContent).toBe("Contador: 6");
    expect(root.querySelectorAll("button")).toHaveLength(1);
  });

  test("ilha que lança erro mantém o HTML original e a seguinte monta", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const root = page(
        '<div data-island="quebra"><p id="original">html do servidor</p></div>' +
          '<div data-island="ok" data-props="{&quot;nome&quot;:&quot;mundo&quot;}"><p>antigo</p></div>',
      );
      mountIslands(
        {
          quebra: () => {
            throw new Error("boom");
          },
          ok: (props: { nome: string }) => view`<span id="montada">olá ${props.nome}</span>`,
        },
        root,
      );
      const [broken, ok] = Array.from(root.querySelectorAll("[data-island]"));
      expect(broken?.innerHTML).toBe('<p id="original">html do servidor</p>');
      expect(error.mock.calls[0]?.[0]).toBe("[slash-ssg] falha ao montar ilha quebra");
      // A segunda ilha foi realmente montada: o HTML antigo saiu e o conteúdo novo entrou
      expect(ok?.querySelector("#montada")?.textContent).toBe("olá mundo");
      expect(ok?.textContent).not.toContain("antigo");
    } finally {
      error.mockRestore();
    }
  });
});
