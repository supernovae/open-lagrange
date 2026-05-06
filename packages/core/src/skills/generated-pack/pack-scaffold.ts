import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { PackBuildPlan } from "./pack-build-plan.js";
import { generatePackFiles } from "./pack-codegen.js";

export interface PackScaffoldResult {
  readonly pack_id: string;
  readonly pack_path: string;
  readonly files: readonly string[];
}

export function writePackScaffold(input: {
  readonly plan: PackBuildPlan;
  readonly output_dir: string;
}): PackScaffoldResult {
  const outputDir = resolve(input.output_dir);
  const packPath = resolve(outputDir, input.plan.pack_id);
  assertInside(outputDir, packPath);
  const generated = generatePackFiles(input.plan);
  const files: string[] = [];
  mkdirSync(packPath, { recursive: true });
  for (const [relative, content] of Object.entries(generated.files)) {
    const path = join(packPath, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
    files.push(relative);
  }
  const artifactDir = join(packPath, "artifacts");
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, "build-plan.json"), JSON.stringify(input.plan, null, 2), "utf8");
  files.push("artifacts/build-plan.json");
  return { pack_id: input.plan.pack_id, pack_path: packPath, files: files.sort() };
}

function assertInside(parent: string, target: string): void {
  const rel = relative(parent, target);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
  throw new Error("Generated pack scaffold path escapes the output directory.");
}
