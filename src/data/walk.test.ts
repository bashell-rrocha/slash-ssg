import { describe, expect, test } from "bun:test";
import { entries } from "./walk";

describe("entries", () => {
  test("monta paths no formato $.a.b[0] para objetos e arrays", () => {
    // Arrange
    const root = { a: { b: ["x"] } };

    // Act
    const paths = entries(root).map((entry) => entry.path);

    // Assert
    expect(paths).toEqual(["$", "$.a", "$.a.b", "$.a.b[0]"]);
  });

  test("informa as chaves e os objetos ancestrais de cada valor", () => {
    // Arrange
    const inner = { text: "oi" };
    const root = { list: [inner] };

    // Act
    const leaf = entries(root).find((entry) => entry.path === "$.list[0].text");

    // Assert
    expect(leaf?.keys).toEqual(["list", "text"]);
    expect(leaf?.records).toEqual([root, inner]);
  });
});
