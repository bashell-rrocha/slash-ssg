import { createState } from "@_bashell/slash/core";
import { Picture } from "../lib/image";
import type { ImageDescriptor } from "../lib/image-core";
import { reactiveView, view } from "../lib/renderer";
import styles from "../styles.module.css";

// Contrato de ilha: o estado (createState) é criado no corpo do componente e a view vai dentro de
// reactiveView. O slash re-executa a função reativa a cada mudança de estado; sem esse wrapper, o
// corpo do componente rodaria de novo e o estado voltaria ao valor inicial a cada atualização.
export function Gallery(props: { images: ImageDescriptor[] }) {
  const index = createState(0);
  const total = props.images.length;
  const go = (delta: number) => index.set((index.get() + delta + total) % total);
  return reactiveView(() => {
    const i = index.get();
    return view`<div class=${styles.gallery}>
      ${Picture(props.images[i] as ImageDescriptor, { sizes: "12rem" })}
      <div class=${styles.controls}>
        <button class=${styles.button} type="button" onClick=${() => go(-1)}>Anterior</button>
        <span aria-live="polite">${i + 1} / ${total}</span>
        <button class=${styles.button} type="button" onClick=${() => go(1)}>Próxima</button>
      </div>
    </div>`;
  });
}
