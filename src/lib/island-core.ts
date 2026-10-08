import { SsgError } from "./errors";
import { escapeHtml } from "./escape";

const INVALID_TYPES: Record<string, string> = {
  undefined: "é undefined (não serializável em JSON)",
  function: "é uma função (não serializável em JSON)",
  symbol: "é um symbol (não serializável em JSON)",
  bigint: "é um bigint (não serializável em JSON)",
};

// Valida e serializa as props de uma ilha; o erro cita a ilha e o caminho da chave
export function serializeProps(name: string, props: unknown): string {
  const ancestors: object[] = [];

  function fail(path: string, why: string): never {
    throw new SsgError(`Ilha "${name}": ${path} ${why}`);
  }

  const walk = (value: unknown, path: string) => {
    const invalid = INVALID_TYPES[typeof value];
    if (invalid) return fail(path, invalid);
    if (typeof value === "number" && !Number.isFinite(value)) {
      return fail(path, `é ${value} (não serializável em JSON; vira null)`);
    }
    if (value === null || typeof value !== "object") return;

    if (ancestors.includes(value)) return fail(path, "cria uma referência circular");
    const isArray = Array.isArray(value);
    if (!isArray) {
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        return fail(path, "não é um objeto plano (use apenas objetos, arrays e primitivos)");
      }
    }
    ancestors.push(value);
    if (isArray) {
      for (let i = 0; i < value.length; i++) {
        // Buracos de arrays esparsos virariam null no JSON
        if (!(i in value)) return fail(`${path}[${i}]`, "é um buraco em um array esparso (não serializável em JSON)");
        walk(value[i], `${path}[${i}]`);
      }
    } else {
      for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
    }
    ancestors.pop();
  };

  walk(props, "props");
  return JSON.stringify(props);
}

export function islandWrapper(name: string, propsJson: string, innerHtml: string): string {
  return `<div data-island="${escapeHtml(name)}" data-props="${escapeHtml(propsJson)}">${innerHtml}</div>`;
}

export function parseIslandProps(raw: string | undefined): unknown {
  return raw === undefined || raw === "" ? {} : JSON.parse(raw);
}
