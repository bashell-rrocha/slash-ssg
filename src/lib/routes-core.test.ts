import { describe, expect, test } from "bun:test";
import { unsafeHtml } from "@_bashell/slash/ssr";
import { SsgError } from "./errors";
import { absoluteUrl, buildUrl, expandRoutes, urlToFile } from "./routes-core";
import type { Route } from "./types";

const page = () => unsafeHtml("<p>x</p>");
const head = { title: "T" };

describe("routes-core", () => {
  test("rota estática vira URL com barra final e arquivo index.html", async () => {
    const [r] = await expandRoutes([{ path: "/sobre", head, page }]);
    expect(r?.url).toBe("/sobre/");
    expect(r?.file).toBe("sobre/index.html");
  });

  test("rota dinâmica expande paths()", async () => {
    const route: Route = {
      path: "/posts/:slug",
      paths: () => [{ slug: "ola" }, { slug: "mundo" }],
      head,
      page,
    };
    const out = await expandRoutes([route]);
    expect(out.map((r) => r.url)).toEqual(["/posts/ola/", "/posts/mundo/"]);
    expect(out[0]?.params).toEqual({ slug: "ola" });
    expect(out[1]?.file).toBe("posts/mundo/index.html");
  });

  test("paths() assíncrono é aguardado", async () => {
    const route: Route = {
      path: "/posts/:slug",
      paths: async () => [{ slug: "a" }],
      head,
      page,
    };
    expect((await expandRoutes([route])).map((r) => r.url)).toEqual(["/posts/a/"]);
  });

  test("rota dinâmica sem paths lança SsgError citando o path", async () => {
    const p = expandRoutes([{ path: "/posts/:slug", head, page }]);
    await expect(p).rejects.toBeInstanceOf(SsgError);
    await expect(p).rejects.toThrow("/posts/:slug");
  });

  test("param ausente em paths() lança SsgError citando o param", async () => {
    const route: Route = { path: "/posts/:slug", paths: () => [{}], head, page };
    const p = expandRoutes([route]);
    await expect(p).rejects.toBeInstanceOf(SsgError);
    await expect(p).rejects.toThrow("slug");
  });

  test("param fora de [a-z0-9-]+ lança SsgError", async () => {
    const route: Route = {
      path: "/posts/:slug",
      paths: () => [{ slug: "Olá Mundo" }],
      head,
      page,
    };
    await expect(expandRoutes([route])).rejects.toBeInstanceOf(SsgError);
  });

  test("URLs duplicadas lançam SsgError citando a URL", async () => {
    const p = expandRoutes([
      { path: "/sobre", head, page },
      { path: "/sobre", head, page },
    ]);
    await expect(p).rejects.toBeInstanceOf(SsgError);
    await expect(p).rejects.toThrow("/sobre/");
  });

  test("/404 vira arquivo 404.html", async () => {
    const [r] = await expandRoutes([{ path: "/404", head, page }]);
    expect(r?.url).toBe("/404");
    expect(r?.file).toBe("404.html");
  });

  test("buildUrl e urlToFile", () => {
    expect(buildUrl("/", {})).toBe("/");
    expect(buildUrl("/posts/:slug", { slug: "ola" })).toBe("/posts/ola/");
    expect(urlToFile("/")).toBe("index.html");
  });

  test("absoluteUrl não duplica barras", () => {
    expect(absoluteUrl("https://ex.com/", "/sobre/")).toBe("https://ex.com/sobre/");
    expect(absoluteUrl("https://ex.com", "/")).toBe("https://ex.com/");
  });
});
