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
    expect(out.pkg.devDependencies["@_bashell/slash-ui"]).toBe(SLASH_UI_PACKAGE);
    expect(SLASH_UI_PACKAGE).toBe("npm:@bashell-rrocha/slash-ui@^0.5.0");
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
    expect("@_bashell/slash-ui" in out.pkg.devDependencies).toBe(false);
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
