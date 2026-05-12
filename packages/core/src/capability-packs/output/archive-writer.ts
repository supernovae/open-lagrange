import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import type { ArtifactSummary } from "../../artifacts/index.js";
import { safeArchiveEntryName, validateOutputPath } from "./policy.js";
import { bundleEntries, serializeBundleContent } from "./artifact-bundler.js";

export async function writeDirectoryExport(input: {
  readonly artifacts: readonly ArtifactSummary[];
  readonly output_path: string;
  readonly manifest: unknown;
  readonly index_path?: string;
}): Promise<readonly string[]> {
  const outputPath = validateOutputPath(input.output_path);
  const files: string[] = [];
  for (const entry of bundleEntries(input.artifacts, input.index_path)) {
    const file = join(outputPath, safeArchiveEntryName(entry.file_name));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, serializeBundleContent(entry.content, entry.artifact.content_type), "utf8");
    files.push(file);
  }
  const manifestPath = join(outputPath, "artifact-manifest.json");
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(input.manifest, null, 2), "utf8");
  files.push(manifestPath);
  return files;
}

export async function writeZipExport(input: {
  readonly artifacts: readonly ArtifactSummary[];
  readonly output_path: string;
  readonly manifest: unknown;
  readonly index_path?: string;
}): Promise<string> {
  const outputPath = validateOutputPath(input.output_path);
  const zip = new JSZip();
  for (const entry of bundleEntries(input.artifacts, input.index_path)) {
    zip.file(safeArchiveEntryName(entry.file_name), serializeBundleContent(entry.content, entry.artifact.content_type));
  }
  zip.file("artifact-manifest.json", JSON.stringify(input.manifest, null, 2));
  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
  return outputPath;
}
