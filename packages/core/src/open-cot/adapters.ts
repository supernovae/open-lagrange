import { z } from "zod";
import { CapabilitySnapshot } from "../schemas/capabilities.js";
import { CognitiveArtifact, OpenCotReconciliationResult } from "../schemas/open-cot.js";
import type { CapabilitySnapshot as CapabilitySnapshotType } from "../schemas/capabilities.js";
import type { CognitiveArtifact as CognitiveArtifactType, OpenCotReconciliationResult as OpenCotReconciliationResultType } from "../schemas/open-cot.js";

export function fromOpenCotArtifact(input: unknown): CognitiveArtifactType {
  return CognitiveArtifact.parse(input);
}

export function toOpenCotArtifact(artifact: CognitiveArtifactType): CognitiveArtifactType {
  return CognitiveArtifact.parse(artifact);
}

export function validateOpenCotArtifactForReconciliation(input: {
  readonly artifact: unknown;
  readonly capability_snapshot: CapabilitySnapshotType;
}): { readonly ok: true; readonly artifact: CognitiveArtifactType } | { readonly ok: false; readonly message: string } {
  const parsed = CognitiveArtifact.safeParse(input.artifact);
  if (!parsed.success) return { ok: false, message: parsed.error.message };
  if (parsed.data.capability_snapshot_id !== input.capability_snapshot.snapshot_id) {
    return { ok: false, message: "Artifact references a different capability snapshot" };
  }
  return { ok: true, artifact: parsed.data };
}

export function extendOpenCotCapabilitySnapshot(input: unknown): CapabilitySnapshotType {
  return CapabilitySnapshot.parse(input);
}

export function toOpenCotReconciliationResult(input: OpenCotReconciliationResultType): OpenCotReconciliationResultType {
  return OpenCotReconciliationResult.parse(input);
}

// TODO(open-cot core): ExecutionPlan currently lives in Open Lagrange because
// Open-COT RFC 0007 is broad pipeline context, not a typed project plan. If
// repeated implementations need portable task planning, propose a core RFC 0007
// amendment or a planning extension RFC with examples.
export const LocalExecutionPlanMarker = z.literal("open-cot.execution-plan.v1");
