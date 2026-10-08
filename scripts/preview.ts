import { resolve } from "node:path";
import { startServer } from "./ssg/serve";
import { parsePort } from "./ssg/serve-core";

let PORT: number;
try {
  PORT = parsePort(process.env.PORT);
} catch (err) {
  console.error(`[preview] ${(err as Error).message}`);
  process.exit(1);
}
const dist = resolve(import.meta.dir, "..", "dist");
try {
  startServer({ dist, port: PORT, dev: false });
} catch (err) {
  if ((err as { code?: string }).code === "EADDRINUSE") {
    console.error(`[preview] A porta ${PORT} já está em uso. Tente outra porta: PORT=${PORT + 1} bun run preview`);
    process.exit(1);
  }
  throw err;
}
console.log(`[preview] http://localhost:${PORT}`);
