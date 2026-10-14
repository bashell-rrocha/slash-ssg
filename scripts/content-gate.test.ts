import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditContent, fictitiousDigest } from "../src/data/gate";
import { allContent } from "../src/data/index";
import { runGate } from "./content-gate";

const FICTITIOUS_CONTENT = { catalog: [{ fictitious: true, name: "Cliente de exemplo" }] };

describe("runGate", () => {
  test("conteúdo limpo sai com código 0 e 'portão aberto'", () => {
    // Arrange
    const content = { vendas: { title: "Título real" } };

    // Act
    const result = runGate(content, null);

    // Assert
    expect(result.code).toBe(0);
    expect(result.out).toContain("portão aberto");
  });

  test("fictício sem liberação sai com código 1 e imprime o digest", () => {
    // Arrange
    const digest = fictitiousDigest(auditContent(FICTITIOUS_CONTENT));

    // Act
    const result = runGate(FICTITIOUS_CONTENT, null);

    // Assert
    expect(result.code).toBe(1);
    expect(result.out).toContain(digest);
  });

  test("liberação válida com o digest atual sai com código 0", () => {
    // Arrange
    const digest = fictitiousDigest(auditContent(FICTITIOUS_CONTENT));
    const releaseText = JSON.stringify({ approvedBy: "Responsável", approvedAt: "2026-10-09", digest, note: "demo" });

    // Act
    const result = runGate(FICTITIOUS_CONTENT, releaseText);

    // Assert
    expect(result.code).toBe(0);
  });

  test("liberação inválida sai com código 1 e 'content-release.json inválido'", () => {
    // Arrange
    const releaseText = '{ "approvedBy": "Responsável" }';

    // Act
    const result = runGate(FICTITIOUS_CONTENT, releaseText);

    // Assert
    expect(result.code).toBe(1);
    expect(result.out).toContain("content-release.json inválido");
  });

  test("os posts de exemplo do template são fictícios e o content-release.json de demonstração os libera", () => {
    // Arrange
    const releaseText = readFileSync(resolve(import.meta.dir, "..", "content-release.json"), "utf8");

    // Act
    const result = runGate(allContent, releaseText);

    // Assert
    expect(result.out).toContain("fictitious (2)");
    expect(result.code).toBe(0);
  });
});
