import { createState } from "@_bashell/slash/core";
import { reactiveView, view } from "../lib/renderer";
import styles from "../styles.module.css";

// Contrato de ilha: o estado (createState) é criado no corpo do componente e a view vai dentro de
// reactiveView. mountIslands chama render(() => Component(props), el), que executa o componente sem
// rastreamento: sem esse wrapper a ilha renderiza uma vez e nunca reage a mudanças de estado. Com ele,
// a função reativa é rastreada e re-executada a cada mudança, sem recriar o estado do corpo do componente.
export function Counter(props: { start: number }) {
  const count = createState(props.start);
  return reactiveView(
    () =>
      view`<button class=${styles.button} type="button" onClick=${() => count.set(count.get() + 1)}>Contador: ${count.get()}</button>`,
  );
}
