import { descriptorToOpenCotCapability, type CapabilityDescriptor as SdkCapabilityDescriptor, type CapabilityExecutionResult } from "@open-lagrange/capability-sdk";
import { buildCapabilitySnapshot, CapabilitySnapshot, type CapabilityDescriptorInput, type CapabilitySnapshot as CapabilitySnapshotType } from "../schemas/capabilities.js";
import { observation, structuredError } from "../reconciliation/records.js";
import type { Observation, StructuredError } from "../schemas/open-cot.js";

export function sdkDescriptorsToCapabilitySnapshot(
  descriptors: readonly SdkCapabilityDescriptor[],
  now: string,
): CapabilitySnapshotType {
  const inputs: CapabilityDescriptorInput[] = descriptors.map((descriptor) => descriptorToOpenCotCapability(descriptor));
  return CapabilitySnapshot.parse(buildCapabilitySnapshot(inputs, now));
}

export function mapCapabilityResultToObservation(input: {
  readonly result: CapabilityExecutionResult;
  readonly now: string;
  readonly task_id?: string;
  readonly intent_id?: string;
}): Observation {
  return observation({
    status: input.result.status === "success" ? "recorded" : input.result.status === "failed" ? "error" : "skipped",
    summary: input.result.status === "success" ? "Capability execution succeeded" : `Capability execution ${input.result.status}`,
    now: input.now,
    ...(input.task_id ? { task_id: input.task_id } : {}),
    ...(input.intent_id ? { intent_id: input.intent_id } : {}),
    ...(input.result.output === undefined ? {} : { output: input.result.output }),
  });
}

export function mapCapabilityResultToStructuredErrors(input: {
  readonly result: CapabilityExecutionResult;
  readonly now: string;
  readonly task_id?: string;
  readonly intent_id?: string;
}): readonly StructuredError[] {
  return input.result.structured_errors.map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return structuredError({
      code: typeof record.code === "string" ? normalizeErrorCode(record.code) : "MCP_EXECUTION_FAILED",
      message: typeof record.message === "string" ? record.message : "Capability execution failed",
      now: input.now,
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(input.intent_id ? { intent_id: input.intent_id } : {}),
    });
  });
}

function normalizeErrorCode(code: string): StructuredError["code"] {
  const allowed: readonly StructuredError["code"][] = [
    "INVALID_ARTIFACT",
    "INVALID_PLAN",
    "INVALID_DELEGATION_CONTEXT",
    "SNAPSHOT_MISMATCH",
    "UNKNOWN_MCP_SERVER",
    "UNKNOWN_CAPABILITY",
    "CAPABILITY_DIGEST_MISMATCH",
    "SCHEMA_VALIDATION_FAILED",
    "POLICY_DENIED",
    "APPROVAL_REQUIRED",
    "PRECONDITION_FAILED",
    "BUDGET_EXCEEDED",
    "MCP_EXECUTION_FAILED",
    "RESULT_VALIDATION_FAILED",
    "CRITIC_FAILED",
    "REVISION_UNSUPPORTED",
    "YIELDED",
  ];
  return allowed.includes(code as StructuredError["code"]) ? code as StructuredError["code"] : "MCP_EXECUTION_FAILED";
}
