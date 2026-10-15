import { describe, expect, test } from "bun:test";
import { SLASH_UI_PACKAGE, standalone } from "./standalone-core";

const PKG = {
  name: "slash-ssg",
  scripts: {
    test: "bun test src/ scripts/ examples/",
    "ui:build": "bun run examples/slash-ui/build.ts",
    "ui:serve": "bun run examples/slash-ui/serve.ts",
  },
  dependencies: { "@_bashell/slash": "^0.0.6", sharp: "^0.34.0" },
  devDependencies: { typescript: "^5.6.2", "@_bashell/slash-ui": "workspace:*" },
};
const SCOPE = '"@bashell-rrocha" = { url = "https://npm.pkg.github.com", token = "$GITHUB_TOKEN" }';

describe("standalone (com o slash-ui)", () => {
  test("troca o workspace:* do slash-ui pelo pacote do GitHub Packages e põe o escopo no bunfig.toml", () => {
    // Arrange
    const input = { pkg: PKG, bunfig: null, withoutUi: false };

    // Act
    const out = standalone(input);

    // Assert
    expect(out.problems).toEqual([]);
    expect(out.pkg.devDependencies?.["@_bashell/slash-ui"]).toBe(SLASH_UI_PACKAGE);
    expect(SLASH_UI_PACKAGE).toBe("npm:@bashell-rrocha/slash-ui@^0.5.1");
    expect(out.bunfig).toBe(`[install.scopes]\n${SCOPE}\n`);
    expect(out.removeDirs).toEqual([]);
    expect(out.pkg.scripts).toEqual(PKG.scripts);
  });

  test("bunfig.toml que já existe ganha o escopo uma vez; rodar de novo não muda nada", () => {
    // Arrange
    const first = standalone({ pkg: PKG, bunfig: "[test]\ncoverage = true\n", withoutUi: false });

    // Act
    const second = standalone({ pkg: first.pkg, bunfig: first.bunfig, withoutUi: false });

    // Assert
    expect(first.bunfig).toBe(`[test]\ncoverage = true\n\n[install.scopes]\n${SCOPE}\n`);
    expect(second).toEqual(first);
  });
});

describe("standalone --without-ui", () => {
  test("tira o slash-ui, o exemplo e os scripts dele, e o examples/ do teste", () => {
    // Arrange
    const input = { pkg: PKG, bunfig: null, withoutUi: true };

    // Act
    const out = standalone(input);

    // Assert
    expect(out.problems).toEqual([]);
    expect(out.pkg.devDependencies).not.toHaveProperty(["@_bashell/slash-ui"]);
    expect(out.pkg.scripts).toEqual({ test: "bun test src/ scripts/" });
    expect(out.removeDirs).toEqual(["examples/slash-ui"]);
    expect(out.bunfig).toBeNull();
  });

  test("rodar de novo não muda nada", () => {
    // Arrange
    const first = standalone({ pkg: PKG, bunfig: null, withoutUi: true });

    // Act
    const second = standalone({ pkg: first.pkg, bunfig: first.bunfig, withoutUi: true });

    // Assert
    expect(second.pkg).toEqual(first.pkg);
    expect(second.problems).toEqual([]);
  });
});

describe("standalone: o que não instala fora do monorepo", () => {
  test("outra dependência em workspace: é problema (com o nome)", () => {
    // Arrange
    const pkg = { ...PKG, dependencies: { ...PKG.dependencies, "@_bashell/slash": "workspace:*" } };

    // Act
    const out = standalone({ pkg, bunfig: null, withoutUi: false });

    // Assert
    expect(out.problems).toEqual([
      '@_bashell/slash: "workspace:*" não instala fora do monorepo; use a versão publicada',
    ]);
  });
});

describe("standalone: package.json incompleto", () => {
  test("sem dependencies, devDependencies e scripts não quebra (com e sem o slash-ui)", () => {
    // Arrange
    const pkg = { name: "mínimo" };

    // Act
    const withUi = standalone({ pkg, bunfig: null, withoutUi: false });
    const withoutUi = standalone({ pkg, bunfig: null, withoutUi: true });

    // Assert
    expect(withUi.problems).toEqual([]);
    expect(withUi.pkg).toEqual({ name: "mínimo" });
    expect(withoutUi.problems).toEqual([]);
    expect(withoutUi.pkg).toEqual({ name: "mínimo" });
  });

  test("só com dependencies: troca o slash-ui ali e não inventa os outros campos", () => {
    // Arrange
    const pkg = { name: "x", dependencies: { "@_bashell/slash-ui": "workspace:*" } };

    // Act
    const out = standalone({ pkg, bunfig: null, withoutUi: false });

    // Assert
    expect(out.pkg).toEqual({ name: "x", dependencies: { "@_bashell/slash-ui": SLASH_UI_PACKAGE } });
  });
});

describe("standalone: bunfig.toml que já mexe em escopos", () => {
  test.each([
    ['[install.scopes]\n"@bashell-rrocha" = "https://npm.pkg.github.com"\n'],
    ['[install.scopes]\n@bashell-rrocha = { url = "https://npm.pkg.github.com" }\n'],
    ["[install.scopes]\n'@bashell-rrocha' = \"https://npm.pkg.github.com\"\n"],
    ['[install]\nscopes = { "@bashell-rrocha" = "https://npm.pkg.github.com" }\n'],
    ['[install]\nscopes."@bashell-rrocha" = "https://npm.pkg.github.com"\n'],
    ['install.scopes = { "@outro" = { url = "x" }, "@bashell-rrocha" = "https://npm.pkg.github.com" }\n'],
  ])("escopo já definido em outro formato não é duplicado: %p", (bunfig) => {
    // Arrange
    const input = { pkg: PKG, bunfig, withoutUi: false };

    // Act
    const out = standalone(input);

    // Assert
    expect(out.problems).toEqual([]);
    expect(out.bunfig).toBe(bunfig);
  });

  test("scopes em linha sem o escopo: não inventa, pede para acrescentar à mão", () => {
    // Arrange
    const bunfig = '[install]\nscopes = { "@outro" = "https://registry.exemplo" }\n';

    // Act
    const out = standalone({ pkg: PKG, bunfig, withoutUi: false });

    // Assert
    expect(out.bunfig).toBe(bunfig);
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0]).toContain("bunfig.toml");
    expect(out.problems[0]).toContain(SCOPE);
  });

  test("[install.scopes] de verdade recebe a entrada logo abaixo, mantendo as outras", () => {
    // Arrange
    const bunfig = '[install.scopes]\n"@outro" = "https://registry.exemplo"\n';

    // Act
    const out = standalone({ pkg: PKG, bunfig, withoutUi: false });

    // Assert
    expect(out.problems).toEqual([]);
    expect(out.bunfig).toBe(`[install.scopes]\n${SCOPE}\n"@outro" = "https://registry.exemplo"\n`);
  });

  test("[install.scopes] só em comentário é ignorado: a tabela vai para o fim", () => {
    // Arrange
    const bunfig = "# [install.scopes]\n[test]\ncoverage = true\n";

    // Act
    const out = standalone({ pkg: PKG, bunfig, withoutUi: false });

    // Assert
    expect(out.problems).toEqual([]);
    expect(out.bunfig).toBe(`# [install.scopes]\n[test]\ncoverage = true\n\n[install.scopes]\n${SCOPE}\n`);
  });

  test("escopo só em comentário não conta como definido", () => {
    // Arrange
    const bunfig = `# ${SCOPE}\n`;

    // Act
    const out = standalone({ pkg: PKG, bunfig, withoutUi: false });

    // Assert
    expect(out.bunfig).toBe(`# ${SCOPE}\n\n[install.scopes]\n${SCOPE}\n`);
  });
});

describe("standalone --without-ui com outros exemplos", () => {
  test("otherExamples: mantém examples/ no script test", () => {
    // Arrange
    const input = { pkg: PKG, bunfig: null, withoutUi: true, otherExamples: true };

    // Act
    const out = standalone(input);

    // Assert
    expect(out.pkg.scripts).toEqual({ test: "bun test src/ scripts/ examples/" });
    expect(out.removeDirs).toEqual(["examples/slash-ui"]);
  });
});
