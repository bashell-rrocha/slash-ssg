export type ContentRecord = Readonly<Record<string, unknown>>;

export interface Entry {
  readonly path: string;
  readonly value: unknown;
  readonly keys: readonly string[];
  readonly records: readonly ContentRecord[];
}

export function isRecord(value: unknown): value is ContentRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Percorre o conteúdo em profundidade; `records` são os objetos que envolvem o valor. */
export function entries(root: unknown): Entry[] {
  return visit({ path: "$", value: root, keys: [], records: [] });
}

function visit(entry: Entry): Entry[] {
  const { path, value, keys, records } = entry;
  if (Array.isArray(value)) {
    const items = value.flatMap((item, index) => visit({ path: `${path}[${index}]`, value: item, keys, records }));
    return [entry, ...items];
  }
  if (isRecord(value)) {
    const inner = [...records, value];
    const props = Object.entries(value).flatMap(([key, child]) =>
      visit({ path: `${path}.${key}`, value: child, keys: [...keys, key], records: inner }),
    );
    return [entry, ...props];
  }
  return [entry];
}
