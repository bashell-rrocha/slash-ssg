import { createState } from "@_bashell/slash/core";
import { reactiveView, view } from "../lib/renderer";
import styles from "../styles.module.css";

// Contrato de ilha: o estado (createState) é criado no corpo do componente e a view vai dentro de
// reactiveView. O slash re-executa a função reativa a cada mudança de estado; sem esse wrapper, o
// corpo do componente rodaria de novo e o estado voltaria ao valor inicial a cada atualização.
export function Counter(props: { start: number }) {
  const count = createState(props.start);
  return reactiveView(
    () =>
      view`<button class=${styles.button} type="button" onClick=${() => count.set(count.get() + 1)}>Contador: ${count.get()}</button>`,
  );
}
