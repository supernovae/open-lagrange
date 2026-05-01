import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createArtifactSummary, registerArtifacts, type ArtifactSummary } from "../artifacts/index.js";

export function writeEvalArtifact(input: {
  readonly output_dir: string;
  readonly artifact_id: string;
  readonly title: string;
  readonly summary: string;
  readonly content: string;
  readonly relative_path: string;
  readonly content_type: string;
  readonly now: string;
}): ArtifactSummary {
  const path = join(input.output_dir, input.relative_path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, input.content, "utf8");
  const artifact = createArtifactSummary({
    artifact_id: input.artifact_id,
    kind: "raw_log",
    title: input.title,
    summary: input.summary,
    path_or_uri: path,
    content_type: input.content_type,
    created_at: input.now,
  });
  registerArtifacts({ artifacts: [artifact], now: input.now });
  return artifact;
}
