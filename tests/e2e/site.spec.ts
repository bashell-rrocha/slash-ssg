import { expect, test } from "@playwright/test";

const PAGES = [
  { url: "/", title: "Slash SSG" },
  { url: "/sobre/", title: "Sobre | Slash SSG" },
  { url: "/posts/primeiro-post/", title: "Primeiro post | Slash SSG" },
  { url: "/posts/segundo-post/", title: "Segundo post | Slash SSG" },
];

for (const { url, title } of PAGES) {
  test(`${url} responde 200 com título e description`, async ({ page }) => {
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(title);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description?.length).toBeGreaterThan(0);
  });
}

test("/sobre/ não carrega JS e / carrega", async ({ request }) => {
  const scripts = async (url: string) => {
    const html = await (await request.get(url)).text();
    return (html.match(/<script[^>]*type="module"/g) ?? []).length;
  };
  expect(await scripts("/sobre/")).toBe(0);
  expect(await scripts("/")).toBeGreaterThan(0);
});

test.describe("sem JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("conteúdo da home visível", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Slash SSG", level: 1 })).toBeVisible();
    await expect(page.getByText("Contador: 3")).toBeVisible();
    await expect(page.getByText("1 / 2")).toBeVisible();
    await expect(page.getByRole("link", { name: "Primeiro post" }).first()).toBeVisible();
  });
});

// Cobertura automatizada do ramo de navegador de reactiveView: clica e confere o DOM atualizado.
test("counter incrementa ao clicar", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: /Contador:/ });
  await expect(button).toHaveText("Contador: 3");
  await button.click();
  await expect(page.getByRole("button", { name: /Contador:/ })).toHaveText("Contador: 4");
});

test("gallery troca a imagem com Próxima/Anterior", async ({ page }) => {
  await page.goto("/");
  const gallery = page.locator('[data-island="gallery"]');
  await expect(gallery.getByText("1 / 2")).toBeVisible();
  await expect(gallery.locator("img")).toHaveAttribute("alt", "Primeira");

  await gallery.getByRole("button", { name: "Próxima" }).click();
  await expect(gallery.getByText("2 / 2")).toBeVisible();
  await expect(gallery.locator("img")).toHaveAttribute("alt", "Segunda");

  await gallery.getByRole("button", { name: "Anterior" }).click();
  await expect(gallery.getByText("1 / 2")).toBeVisible();
  await expect(gallery.locator("img")).toHaveAttribute("alt", "Primeira");
});

test("hero tem picture com avif e webp e fetchpriority alto", async ({ page, request }) => {
  await page.goto("/");
  const hero = page.locator("picture").first();
  await expect(hero.locator('source[type="image/avif"]')).toHaveCount(1);
  await expect(hero.locator('source[type="image/webp"]')).toHaveCount(1);
  await expect(hero.locator("img")).toHaveAttribute("fetchpriority", "high");

  const srcsets = await hero
    .locator("source, img")
    .evaluateAll((els) => els.map((el) => el.getAttribute("srcset") ?? ""));
  const urls = srcsets
    .flatMap((s) => s.split(",").map((part) => part.trim().split(/\s+/)[0] as string))
    .filter(Boolean);
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) {
    const res = await request.get(url);
    expect(res.status(), url).toBe(200);
  }
});

test("imagens da galeria são lazy", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-island="gallery"] img')).toHaveAttribute("loading", "lazy");
});

test("og:image aponta para JPEG existente", async ({ page, request }) => {
  await page.goto("/");
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toBeTruthy();
  const res = await request.get(new URL(og as string).pathname);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/jpeg");
});

test("URL inexistente devolve 404 com a página 404", async ({ page }) => {
  const response = await page.goto("/nao-existe/");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("Página não encontrada | Slash SSG");
});

test("sitemap.xml lista 4 URLs", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect((xml.match(/<loc>/g) ?? []).length).toBe(4);
});

test("query string de campanha serve a página", async ({ page }) => {
  const response = await page.goto("/sobre/?utm_source=insta");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Sobre | Slash SSG");
});
