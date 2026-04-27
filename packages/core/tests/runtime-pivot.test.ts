import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("runtime pivot", () => {
  it("uses Hatchet packages and excludes the previous runtime packages", async () => {
    const root = process.cwd();
    const files = [
      "package.json",
      "packages/core/package.json",
      "apps/cli/package.json",
      "package-lock.json",
    ];

    const texts = await Promise.all(files.map(async (file) => readFile(join(root, file), "utf8")));
    expect(texts.join("\n")).toContain("@hatchet-dev/typescript-sdk");
    const previousPackageScope = ["@resta", "tedev/"].join("");
    for (const text of texts) expect(text).not.toContain(previousPackageScope);
  });
});
