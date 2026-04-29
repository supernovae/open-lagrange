import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_CONTAINERFILES = [
  "containers/api.Containerfile",
  "containers/worker.Containerfile",
  "containers/web.Containerfile",
] as const;

export function resolveSourceRoot(input: { readonly sourceRoot?: string } = {}): string {
  const candidate = input.sourceRoot ?? process.env.OPEN_LAGRANGE_SOURCE_ROOT ?? inferSourceRoot();
  const root = resolve(candidate);
  const missing = REQUIRED_CONTAINERFILES.filter((path) => !existsSync(join(root, path)));
  if (missing.length > 0) {
    throw new Error([
      `Open Lagrange source root is missing runtime container files: ${root}`,
      `Missing: ${missing.join(", ")}`,
      "Set OPEN_LAGRANGE_SOURCE_ROOT=/path/to/open-lagrange and rerun open-lagrange init.",
    ].join("\n"));
  }
  return root;
}

function inferSourceRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let index = 0; index < 8; index += 1) {
    if (REQUIRED_CONTAINERFILES.every((path) => existsSync(join(current, path)))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}
