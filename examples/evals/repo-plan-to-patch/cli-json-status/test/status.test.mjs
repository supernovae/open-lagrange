import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("fixture documents the status command", () => {
  const source = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf8");
  assert.match(source, /status: ok/);
});
