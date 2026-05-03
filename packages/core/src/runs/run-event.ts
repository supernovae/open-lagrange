import { z } from "zod";

export const RunEventType = z.enum([
  "run.created",
  "run.started",
  "run.completed",
  "run.failed",
  "run.yielded",
  "run.resume_requested",
  "run.retry_requested",
  "run.cancel_requested",
  "run.cancelled",
  "node.started",
  "node.completed",
  "node.failed",
  "node.yielded",
  "capability.started",
  "capability.completed",
  "capability.failed",
  "policy.evaluated",
  "approval.requested",
  "approval.resolved",
  "artifact.created",
  "model_call.completed",
  "verification.started",
  "verification.completed",
  "repair.started",
  "repair.completed",
]);

export const RunEvent = z.object({
  event_id: z.string().min(1),
  run_id: z.string().min(1),
  plan_id: z.string().min(1),
  type: RunEventType,
  timestamp: z.string().datetime(),
  node_id: z.string().min(1).optional(),
  capability_ref: z.string().min(1).optional(),
  artifact_id: z.string().min(1).optional(),
  approval_id: z.string().min(1).optional(),
  model_call_artifact_id: z.string().min(1).optional(),
  trace_id: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type RunEventType = z.infer<typeof RunEventType>;
export type RunEvent = z.infer<typeof RunEvent>;

export function createRunEvent(input: Omit<RunEvent, "event_id" | "payload"> & { readonly event_id?: string; readonly payload?: Record<string, unknown> }): RunEvent {
  const key = [
    input.run_id,
    input.plan_id,
    input.type,
    input.node_id ?? "",
    input.capability_ref ?? "",
    input.artifact_id ?? "",
    input.approval_id ?? "",
    input.model_call_artifact_id ?? "",
    input.timestamp,
  ].join(":");
  return RunEvent.parse({
    ...input,
    event_id: input.event_id ?? `run_event_${hashString(key).slice(0, 24)}`,
    payload: input.payload ?? {},
  });
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
