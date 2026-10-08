import { resolve } from "node:path";
import { SsgError } from "../src/lib/errors";
import { buildSite } from "./ssg/build-site";

// Build one-shot: roda uma vez e o processo termina (o dev dispara um subprocesso por rebuild)
const dev = process.argv.includes("--dev");
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

try {
  const { pages, jsBytes, cssBytes, ms } = await buildSite({ root: resolve(import.meta.dir, ".."), dev });
  console.log(`[build] ${pages} páginas | JS ${kb(jsBytes)} | CSS ${kb(cssBytes)} | ${ms} ms`);
} catch (err) {
  if (err instanceof SsgError) {
    console.error(err.message);
    if (err.cause instanceof Error && err.cause.stack) console.error(err.cause.stack);
    process.exit(1);
  }
  throw err;
}
