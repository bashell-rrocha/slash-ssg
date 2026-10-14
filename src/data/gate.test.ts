import { describe, expect, test } from "bun:test";
import { auditContent, type ContentRelease, fictitiousDigest, gateVerdict, parseRelease } from "./gate";

function releaseFor(content: unknown): ContentRelease {
  return {
    approvedBy: "Responsável",
    approvedAt: "2026-10-09",
    digest: fictitiousDigest(auditContent(content)),
    note: "demonstração",
  };
}

describe("auditContent", () => {
  test("objeto limpo não gera achados", () => {
    // Arrange
    const content = { vendas: { title: "Título real", items: ["a", "b"] } };

    // Act
    const findings = auditContent(content);

    // Assert
    expect(findings).toEqual([]);
  });

  test("registro fictitious em $.a vira achado fictitious com o path e um sample", () => {
    // Arrange
    const content = { a: { fictitious: true, name: "Cliente de exemplo" } };

    // Act
    const findings = auditContent(content);

    // Assert
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "fictitious", path: "$.a", sample: "Cliente de exemplo" });
  });

  test("string com [...] vira achado placeholder", () => {
    // Arrange
    const content = { footer: { email: "[E-MAIL]" } };

    // Act
    const findings = auditContent(content);

    // Assert
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "placeholder", path: "$.footer.email", sample: "[E-MAIL]" });
  });

  test("registro com pending vira achado pending", () => {
    // Arrange
    const content = { privacidade: { title: "Privacidade", pending: ["confirmar prazo de guarda"] } };

    // Act
    const findings = auditContent(content);

    // Assert
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "pending", path: "$.privacidade", sample: "confirmar prazo de guarda" });
  });

  test("achado dentro de array leva o índice no path", () => {
    // Arrange
    const content = { catalog: [{ name: "Real" }, { fictitious: true, name: "Projeto de exemplo" }] };

    // Act
    const findings = auditContent(content);

    // Assert
    expect(findings.map((finding) => finding.path)).toEqual(["$.catalog[1]"]);
  });
});

describe("gateVerdict", () => {
  test("sem achados o portão fica aberto", () => {
    // Arrange
    const findings = auditContent({ title: "Limpo" });

    // Act
    const verdict = gateVerdict(findings, null);

    // Assert
    expect(verdict.open).toBe(true);
  });

  test("só fictícios e sem liberação o portão fica fechado", () => {
    // Arrange
    const findings = auditContent({ a: { fictitious: true, name: "X" } });

    // Act
    const verdict = gateVerdict(findings, null);

    // Assert
    expect(verdict.open).toBe(false);
  });

  test("liberação com o mesmo digest abre o portão", () => {
    // Arrange
    const content = { a: { fictitious: true, name: "X" } };
    const release = releaseFor(content);

    // Act
    const verdict = gateVerdict(auditContent(content), release);

    // Assert
    expect(verdict.open).toBe(true);
  });

  test("fictício mais placeholder fica fechado mesmo com liberação", () => {
    // Arrange
    const content = { a: { fictitious: true, name: "X" }, b: "[CNPJ]" };
    const release = releaseFor(content);

    // Act
    const verdict = gateVerdict(auditContent(content), release);

    // Assert
    expect(verdict.open).toBe(false);
  });

  test("registro fictício alterado depois da liberação fecha o portão", () => {
    // Arrange
    const release = releaseFor({ a: { fictitious: true, name: "X", text: "antes" } });
    const changed = { a: { fictitious: true, name: "X", text: "depois" } };

    // Act
    const verdict = gateVerdict(auditContent(changed), release);

    // Assert
    expect(verdict.open).toBe(false);
  });

  test("fictício novo depois da liberação fecha o portão", () => {
    // Arrange
    const release = releaseFor({ a: { fictitious: true, name: "X" } });
    const grown = { a: { fictitious: true, name: "X" }, b: { fictitious: true, name: "Y" } };

    // Act
    const verdict = gateVerdict(auditContent(grown), release);

    // Assert
    expect(verdict.open).toBe(false);
  });
});

describe("parseRelease", () => {
  test("JSON inválido devolve Error", () => {
    // Arrange
    const text = "{ approvedBy: ";

    // Act
    const release = parseRelease(text);

    // Assert
    expect(release).toBeInstanceOf(Error);
  });
});
