import type { ArtifactSummary } from "../../artifacts/index.js";
import { stableHash } from "../../util/hash.js";
import { createRunDigest } from "./run-digest.js";
import type { ExcludedArtifact, GenerationMode, PacketType } from "./schemas.js";

export interface RunPacketBuildResult {
  readonly packet_id: string;
  readonly markdown: string;
  readonly manifest: Record<string, unknown>;
  readonly generation_mode: GenerationMode;
  readonly warnings: readonly string[];
}

export async function buildRunPacket(input: {
  readonly run_id: string;
  readonly packet_type: PacketType;
  readonly artifacts: readonly ArtifactSummary[];
  readonly excluded_artifacts: readonly ExcludedArtifact[];
  readonly deterministic?: boolean;
  readonly model?: boolean;
  readonly model_route_id?: string;
  readonly artifact_dir?: string;
  readonly artifact_index_path?: string;
  readonly plan_id?: string;
}): Promise<RunPacketBuildResult> {
  const packetId = `run_packet_${stableHash({ run: input.run_id, type: input.packet_type, artifacts: input.artifacts.map((artifact) => artifact.artifact_id) }).slice(0, 18)}`;
  const digest = await createRunDigest({
    artifacts: input.artifacts,
    style: input.packet_type === "developer" ? "developer" : input.packet_type === "research" ? "research" : "concise",
    max_words: 900,
    ...(input.deterministic === undefined ? {} : { deterministic: input.deterministic }),
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.model_route_id ? { model_route_id: input.model_route_id } : {}),
    ...(input.artifact_dir ? { artifact_dir: input.artifact_dir } : {}),
    ...(input.artifact_index_path ? { artifact_index_path: input.artifact_index_path } : {}),
    ...(input.plan_id ? { plan_id: input.plan_id } : {}),
  });
  const manifest = {
    schema_version: "open-lagrange.run-packet.v1",
    packet_id: packetId,
    run_id: input.run_id,
    packet_type: input.packet_type,
    included_artifact_ids: input.artifacts.map((artifact) => artifact.artifact_id),
    excluded_artifacts: input.excluded_artifacts,
    generated_at: new Date().toISOString(),
  };
  const markdown = [
    `# ${packetTitle(input.packet_type)}`,
    "",
    `Run: ${input.run_id}`,
    "",
    digest.markdown.trim(),
    "",
    "## Included Artifacts",
    ...input.artifacts.map((artifact) => `- ${artifact.title} (${artifact.kind}, ${artifact.artifact_id})`),
    ...(input.excluded_artifacts.length > 0 ? ["", "## Excluded Artifacts", ...input.excluded_artifacts.map((artifact) => `- ${artifact.artifact_id}: ${artifact.reason}`)] : []),
    "",
  ].join("\n");
  return { packet_id: packetId, markdown, manifest, generation_mode: digest.generation_mode, warnings: digest.warnings };
}

function packetTitle(type: PacketType): string {
  if (type === "research") return "Research Run Packet";
  if (type === "developer") return "Developer Handoff Report";
  if (type === "debug") return "Debug Run Packet";
  return "Run Packet";
}
