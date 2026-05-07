import type { PlanNode } from "../planning/planfile-schema.js";
import type { RetryReplayMode } from "./node-attempt.js";

export const availableReplayModes = ["reuse_artifacts", "refresh_artifacts", "force_new_idempotency_key"] as const;

export interface ReplayPolicyDecision {
  readonly ok: boolean;
  readonly reason?: string;
  readonly requires_approval?: boolean;
}

export function evaluateNodeReplayPolicy(input: {
  readonly node: PlanNode;
  readonly replay_mode: RetryReplayMode | undefined;
}): ReplayPolicyDecision {
  if (!input.replay_mode) {
    return { ok: false, reason: `Replay mode is required. Available modes: ${availableReplayModes.join(", ")}.` };
  }
  const sideEffecting = input.node.risk_level === "write" || input.node.risk_level === "external_side_effect" || input.node.risk_level === "destructive";
  if (input.replay_mode === "reuse_artifacts") {
    return sideEffecting
      ? { ok: true, reason: "Artifacts may be reused without re-executing side effects." }
      : { ok: true };
  }
  if (input.replay_mode === "refresh_artifacts") {
    const refreshable = input.node.risk_level === "read" && ["inspect", "research", "fetch", "extract", "analyze", "frame"].includes(input.node.kind);
    return refreshable ? { ok: true } : { ok: false, reason: "refresh_artifacts is only allowed for read/fetch/extract-style nodes." };
  }
  if (input.replay_mode === "force_new_idempotency_key") {
    return sideEffecting ? { ok: true, requires_approval: true, reason: "Re-executing side-effecting work requires approval." } : { ok: true };
  }
  return { ok: false, reason: `Unsupported replay mode: ${input.replay_mode}` };
}
