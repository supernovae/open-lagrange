import type { PrimitiveContext } from "./context.js";
import { primitiveError } from "./errors.js";

export interface ArtifactLineage {
  readonly produced_by_pack_id: string;
  readonly produced_by_capability_id: string;
  readonly produced_by_plan_id?: string;
  readonly produced_by_node_id?: string;
  readonly produced_by_task_id?: string;
  readonly input_artifact_refs: readonly string[];
  readonly output_artifact_refs: readonly string[];
}

export interface PrimitiveArtifactWriteInput {
  readonly artifact_id: string;
  readonly kind: string;
  readonly title?: string;
  readonly summary: string;
  readonly content?: unknown;
  readonly content_type?: string;
  readonly path_or_uri?: string;
  readonly input_artifact_refs?: readonly string[];
  readonly output_artifact_refs?: readonly string[];
  readonly validation_status?: "pass" | "fail" | "pending" | "not_applicable";
  readonly redaction_status?: "redacted" | "not_required" | "pending";
  readonly metadata?: Record<string, unknown>;
}

export interface PrimitiveArtifactSummary {
  readonly artifact_id: string;
  readonly kind: string;
  readonly title?: string;
  readonly summary: string;
  readonly path_or_uri?: string;
  readonly created_at: string;
  readonly lineage: ArtifactLineage;
  readonly validation_status: "pass" | "fail" | "pending" | "not_applicable";
  readonly redaction_status: "redacted" | "not_required" | "pending";
}

export async function write(context: PrimitiveContext, input: PrimitiveArtifactWriteInput): Promise<PrimitiveArtifactSummary> {
  const created_at = new Date().toISOString();
  const lineage = createLineage(context, {
    input_artifact_refs: input.input_artifact_refs ?? [],
    output_artifact_refs: input.output_artifact_refs ?? [input.artifact_id],
  });
  const summary: PrimitiveArtifactSummary = {
    artifact_id: input.artifact_id,
    kind: input.kind,
    ...(input.title ? { title: input.title } : {}),
    summary: input.summary,
    ...(input.path_or_uri ? { path_or_uri: input.path_or_uri } : {}),
    created_at,
    lineage,
    validation_status: input.validation_status ?? "not_applicable",
    redaction_status: input.redaction_status ?? "redacted",
  };
  const payload = {
    ...summary,
    ...(input.content_type ? { content_type: input.content_type } : {}),
    ...(input.content !== undefined ? { content: context.redactor.redactObject(input.content) } : {}),
    metadata: context.redactor.redactObject(input.metadata ?? {}),
  };
  try {
    await context.artifact_store.write(payload);
  } catch (error) {
    throw primitiveError("Artifact write failed.", "PRIMITIVE_ARTIFACT_FAILED", {
      artifact_id: input.artifact_id,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  return summary;
}

export async function readMetadata(context: PrimitiveContext, artifact_id: string): Promise<unknown | undefined> {
  return context.artifact_store.readMetadata?.(artifact_id);
}

export async function link(
  context: PrimitiveContext,
  from_artifact_id: string,
  to_artifact_id: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await context.artifact_store.link?.(from_artifact_id, to_artifact_id, context.redactor.redactObject(metadata));
}

export function createLineage(
  context: PrimitiveContext,
  refs: { readonly input_artifact_refs?: readonly string[]; readonly output_artifact_refs?: readonly string[] } = {},
): ArtifactLineage {
  return {
    produced_by_pack_id: context.pack_id,
    produced_by_capability_id: context.capability_id,
    ...(context.plan_id ? { produced_by_plan_id: context.plan_id } : {}),
    ...(context.node_id ? { produced_by_node_id: context.node_id } : {}),
    ...(context.task_id ? { produced_by_task_id: context.task_id } : {}),
    input_artifact_refs: refs.input_artifact_refs ?? [],
    output_artifact_refs: refs.output_artifact_refs ?? [],
  };
}

export const artifacts = {
  write,
  readMetadata,
  link,
  createLineage,
};
