import { view } from "@_bashell/slash-ui/core";
import { registerServiceWorker } from "@_bashell/slash-ui/host";

// Ilha do PWA nas páginas do app: no navegador, registra o service worker (escopo /app/). No ssg só as páginas com
// ilha carregam o JS do cliente, então o registro vai numa ilha. Não desenha nada.
export const SW_URL = "/app/sw.js";
export const SW_SCOPE = "/app/";

export function PwaRegister(_props: Record<string, never>) {
  registerServiceWorker(SW_URL, SW_SCOPE);
  return view`<span hidden></span>`;
}
