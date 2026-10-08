import { expect, test } from "bun:test";
import { createBuildQueue } from "./build-queue";

test("gatilhos durante um build geram exatamente um build extra", async () => {
  let runs = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const queue = createBuildQueue(async () => {
    runs++;
    if (runs === 1) await gate;
  });
  queue.trigger();
  for (let i = 0; i < 5; i++) queue.trigger();
  release();
  await queue.idle();
  expect(runs).toBe(2);
});

test("nunca executa builds em paralelo", async () => {
  let active = 0;
  let maxActive = 0;
  const queue = createBuildQueue(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await Bun.sleep(10);
    active--;
  });
  queue.trigger();
  await Bun.sleep(3);
  queue.trigger();
  await Bun.sleep(3);
  queue.trigger();
  await queue.idle();
  expect(maxActive).toBe(1);
});

test("idle resolve imediatamente sem build em andamento", async () => {
  const queue = createBuildQueue(async () => {});
  await queue.idle();
});
