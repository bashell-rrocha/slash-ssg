import { islandWrapper, serializeProps } from "./island-core";

// Renderiza a ilha no build: HTML inicial dentro do wrapper com as props serializadas
export function island<P>(name: string, Component: (props: P) => unknown, props: P): string {
  const propsJson = serializeProps(name, props);
  return islandWrapper(name, propsJson, String(Component(props)));
}
