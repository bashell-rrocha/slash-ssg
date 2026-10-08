// Fila de builds: nunca roda dois ao mesmo tempo; gatilhos durante um build viram um único build extra.
export function createBuildQueue(run: () => Promise<void>): { trigger(): void; idle(): Promise<void> } {
  let running: Promise<void> | null = null;
  let pending = false;

  const loop = async () => {
    do {
      pending = false;
      try {
        await run();
      } catch (err) {
        console.error("[build-queue] build lançou exceção:", err);
      }
    } while (pending);
    running = null;
  };

  return {
    trigger() {
      if (running) pending = true;
      else running = loop();
    },
    idle: async () => {
      while (running) await running;
    },
  };
}
