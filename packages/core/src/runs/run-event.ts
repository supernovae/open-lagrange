import { z } from "zod";
import { StructuredError } from "../schemas/open-cot.js";
import { CapabilityStepPolicyDecisionReport } from "../runtime/capability-step-schema.js";
import { NextAction } from "./run-next-action.js";

const EventMetadata = z.object({
  event_id: z.string().min(1),
  plan_id: z.string().min(1),
}).strict();

const Base = z.object({
  run_id: z.string().min(1),
  timestamp: z.string().datetime(),
}).strict();

const NodeBase = Base.extend({
  node_id: z.string().min(1),
  attempt_id: z.string().min(1),
  title: z.string().min(1).optional(),
}).strict();

const CapabilityBase = NodeBase.extend({
  capability_ref: z.string().min(1),
}).strict();

export const RunEventDomain = z.discriminatedUnion("type", [
  Base.extend({ type: z.literal("run.created") }).strict(),
  Base.extend({ type: z.literal("run.started") }).strict(),
  Base.extend({ type: z.literal("run.completed"), artifact_refs: z.array(z.string().min(1)) }).strict(),
  Base.extend({ type: z.literal("run.failed"), errors: z.array(StructuredError) }).strict(),
  Base.extend({ type: z.literal("run.yielded"), reason: z.string().min(1), next_actions: z.array(NextAction) }).strict(),
  Base.extend({ type: z.literal("run.cancelled"), reason: z.string().min(1).optional() }).strict(),
  NodeBase.extend({ type: z.literal("node.started") }).strict(),
  NodeBase.extend({ type: z.literal("node.completed"), artifact_refs: z.array(z.string().min(1)) }).strict(),
  NodeBase.extend({ type: z.literal("node.failed"), errors: z.array(StructuredError) }).strict(),
  NodeBase.extend({ type: z.literal("node.yielded"), reason: z.string().min(1), next_actions: z.array(NextAction) }).strict(),
  CapabilityBase.extend({ type: z.literal("capability.started") }).strict(),
  CapabilityBase.extend({ type: z.literal("capability.completed"), artifact_refs: z.array(z.string().min(1)) }).strict(),
  CapabilityBase.extend({ type: z.literal("capability.failed"), errors: z.array(StructuredError) }).strict(),
  Base.extend({ type: z.literal("policy.evaluated"), node_id: z.string().min(1).optional(), capability_ref: z.string().min(1).optional(), decision: z.string().min(1), policy_report_ref: z.string().min(1).optional(), policy_report: CapabilityStepPolicyDecisionReport.optional() }).strict(),
  Base.extend({ type: z.literal("approval.requested"), node_id: z.string().min(1).optional(), approval_id: z.string().min(1) }).strict(),
  Base.extend({ type: z.literal("approval.resolved"), node_id: z.string().min(1).optional(), approval_id: z.string().min(1), decision: z.enum(["approved", "rejected"]) }).strict(),
  Base.extend({ type: z.literal("artifact.created"), node_id: z.string().min(1).optional(), artifact_id: z.string().min(1), kind: z.string().min(1) }).strict(),
  Base.extend({ type: z.literal("model_call.completed"), node_id: z.string().min(1).optional(), artifact_id: z.string().min(1), role: z.string().min(1), model: z.string().min(1) }).strict(),
  NodeBase.extend({ type: z.literal("verification.started"), command_id: z.string().min(1) }).strict(),
  NodeBase.extend({ type: z.literal("verification.completed"), command_id: z.string().min(1), passed: z.boolean(), report_ref: z.string().min(1).optional() }).strict(),
  NodeBase.extend({ type: z.literal("repair.started"), repair_attempt: z.number().int().min(1) }).strict(),
  NodeBase.extend({ type: z.literal("repair.completed"), repair_attempt: z.number().int().min(1), status: z.string().min(1) }).strict(),
]);

export const RunEvent = z.intersection(EventMetadata, RunEventDomain);

export type RunEventDomain = z.infer<typeof RunEventDomain>;
export type RunEvent = z.infer<typeof RunEvent>;
export type RunEventType = RunEvent["type"];
type RunEventInput = RunEventDomain & { readonly plan_id: string; readonly event_id?: string };

export function createRunEvent(input: RunEventInput): RunEvent {
  const key = [
    input.run_id,
    input.plan_id,
    input.type,
    "node_id" in input ? input.node_id ?? "" : "",
    "capability_ref" in input ? input.capability_ref ?? "" : "",
    "artifact_id" in input ? input.artifact_id ?? "" : "",
    "approval_id" in input ? input.approval_id ?? "" : "",
    input.timestamp,
  ].join(":");
  return RunEvent.parse({
    ...input,
    event_id: input.event_id ?? `run_event_${hashString(key).slice(0, 24)}`,
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
