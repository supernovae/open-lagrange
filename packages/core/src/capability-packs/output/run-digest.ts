import { z } from "zod";
import { showArtifact, type ArtifactSummary } from "../../artifacts/index.js";
import { findModelRouteConfig, listModelRouteConfigs, type ModelRouteConfig } from "../../evals/model-route-config.js";
import { executeModelRoleCall, ModelRoleCallError } from "../../models/model-route-executor.js";
import { stableHash } from "../../util/hash.js";
import type { DigestStyle, GenerationMode } from "./schemas.js";

export const DigestModelOutput = z.object({
  title: z.string().min(1),
  overview: z.string().min(1),
  key_points: z.array(z.string().min(1)).min(1),
  important_artifact_ids: z.array(z.string().min(1)),
  next_steps: z.array(z.string().min(1)).default([]),
}).strict();

export interface DigestResult {
  readonly digest_id: string;
  readonly markdown: string;
  readonly generation_mode: GenerationMode;
  readonly warnings: readonly string[];
  readonly telemetry_artifact_id?: string;
}

export async function createRunDigest(input: {
  readonly artifacts: readonly ArtifactSummary[];
  readonly style: DigestStyle;
  readonly max_words: number;
  readonly deterministic?: boolean;
  readonly model?: boolean;
  readonly model_route_id?: string;
  readonly artifact_dir?: string;
  readonly artifact_index_path?: string;
  readonly plan_id?: string;
  readonly node_id?: string;
}): Promise<DigestResult> {
  const digestId = `run_digest_${stableHash({ artifacts: input.artifacts.map((artifact) => artifact.artifact_id), style: input.style }).slice(0, 18)}`;
  const context = digestContext(input.artifacts, input.artifact_index_path);
  if (input.deterministic) {
    return { digest_id: digestId, markdown: deterministicDigest(context, input.style, input.max_words), generation_mode: "deterministic_requested", warnings: [] };
  }
  const route = modelRoute(input.model_route_id);
  if (route) {
    try {
      const result = await executeModelRoleCall({
        role: "reviewer",
        model_ref: route.roles.reviewer,
        schema: DigestModelOutput,
        system: [
          "Create a concise output digest from safe artifact metadata and excerpts only.",
          "Do not invent artifacts.",
          "Do not include secrets, raw prompts, or restricted content.",
          "Return the requested JSON object only.",
        ].join("\n"),
        prompt: JSON.stringify({ style: input.style, max_words: input.max_words, artifacts: context }),
        trace_context: {
          route_id: route.route_id,
          ...(input.plan_id ? { plan_id: input.plan_id } : {}),
          ...(input.node_id ? { node_id: input.node_id } : {}),
          ...(input.artifact_dir ? { artifact_dir: input.artifact_dir } : {}),
          ...(input.artifact_index_path ? { artifact_index_path: input.artifact_index_path } : {}),
          input_artifact_refs: input.artifacts.map((artifact) => artifact.artifact_id),
          output_artifact_refs: [digestId],
          output_schema_name: "OutputDigest",
        },
        persist_telemetry: Boolean(input.artifact_dir),
      });
      return {
        digest_id: digestId,
        markdown: markdownFromModel(result.object, input.style),
        generation_mode: "model",
        warnings: [],
        ...(result.telemetry_artifact_id ? { telemetry_artifact_id: result.telemetry_artifact_id } : {}),
      };
    } catch (error) {
      const warning = error instanceof ModelRoleCallError ? `${error.code}:${error.message}` : `MODEL_DIGEST_FAILED:${error instanceof Error ? error.message : String(error)}`;
      return { digest_id: digestId, markdown: deterministicDigest(context, input.style, input.max_words), generation_mode: "deterministic_fallback", warnings: [warning] };
    }
  }
  return { digest_id: digestId, markdown: deterministicDigest(context, input.style, input.max_words), generation_mode: "deterministic_fallback", warnings: ["MODEL_PROVIDER_UNAVAILABLE"] };
}

export function digestContext(artifacts: readonly ArtifactSummary[], indexPath?: string): readonly Record<string, unknown>[] {
  return artifacts.map((artifact) => ({
    artifact_id: artifact.artifact_id,
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary,
    content_type: artifact.content_type,
    input_artifact_refs: artifact.input_artifact_refs ?? [],
    excerpt: safeExcerpt(showArtifact(artifact.artifact_id, indexPath)?.content),
  }));
}

function deterministicDigest(context: readonly Record<string, unknown>[], style: DigestStyle, maxWords: number): string {
  const title = style === "executive" ? "Executive Run Digest" : style === "developer" ? "Developer Run Digest" : style === "research" ? "Research Run Digest" : "Run Digest";
  const lines = [
    `# ${title}`,
    "",
    `Generated from ${context.length} selected artifact(s).`,
    "",
    "## Important Outputs",
    ...context.slice(0, Math.max(1, Math.min(12, context.length))).map((artifact) => `- **${artifact.title}** (${artifact.kind}, ${artifact.artifact_id}): ${artifact.summary}`),
  ];
  const words = lines.join("\n").split(/\s+/);
  return `${words.slice(0, maxWords).join(" ")}\n`;
}

function markdownFromModel(output: z.infer<typeof DigestModelOutput>, style: DigestStyle): string {
  return [
    `# ${output.title}`,
    "",
    output.overview,
    "",
    "## Key Points",
    ...output.key_points.map((point) => `- ${point}`),
    "",
    "## Important Artifacts",
    ...output.important_artifact_ids.map((artifactId) => `- ${artifactId}`),
    ...(output.next_steps.length > 0 ? ["", "## Next Steps", ...output.next_steps.map((step) => `- ${step}`)] : []),
    "",
    `Generation style: ${style}`,
  ].join("\n");
}

function modelRoute(routeId: string | undefined): ModelRouteConfig | undefined {
  if (routeId) return findModelRouteConfig(routeId);
  return listModelRouteConfigs()[0];
}

function safeExcerpt(value: unknown): string {
  const text = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value);
  return text.replace(/\s+/g, " ").slice(0, 1200);
}
