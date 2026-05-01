import { getStateStore } from "../storage/state-store.js";
import { ScopeExpansionApprovalPayload, scopeExpansionRequestDigest, type PersistedScopeExpansionRequest } from "./scope-expansion.js";

export async function createScopeExpansionApproval(input: {
  readonly request: PersistedScopeExpansionRequest;
  readonly now: string;
}) {
  const digest = scopeExpansionRequestDigest(input.request);
  const approvalRequest = {
    approval_request_id: input.request.request_id,
    task_id: input.request.node_id,
    project_id: input.request.plan_id,
    intent_id: `scope_expansion_${input.request.request_id}`,
    requested_risk_level: input.request.requested_risk_level ?? "write",
    requested_capability: "repo.scope_expansion",
    task_run_id: input.request.plan_id,
    requested_at: input.now,
    prompt: scopeExpansionPrompt(input.request, digest),
    trace_id: `trace_${input.request.plan_id}`,
  };
  const decision = await getStateStore().createApprovalRequest(approvalRequest);
  await getStateStore().recordApprovalContinuationEnvelope({
    kind: "scope_expansion",
    approval_request: approvalRequest,
    project_id: input.request.plan_id,
    task_run_id: input.request.plan_id,
    trace_id: `trace_${input.request.plan_id}`,
    payload: ScopeExpansionApprovalPayload.parse({
      request: { ...input.request, approval_id: approvalRequest.approval_request_id },
      request_digest: digest,
      requested_files: input.request.requested_files ?? [],
      requested_capabilities: input.request.requested_capabilities ?? [],
      requested_verification_commands: input.request.requested_verification_commands ?? [],
    }),
  });
  return { approvalRequest, decision, digest };
}

function scopeExpansionPrompt(request: PersistedScopeExpansionRequest, digest: string): string {
  return [
    request.reason,
    `Node: ${request.node_id}`,
    `Requested files: ${(request.requested_files ?? []).join(", ") || "none"}`,
    `Requested capabilities: ${(request.requested_capabilities ?? []).join(", ") || "none"}`,
    `Requested verification commands: ${(request.requested_verification_commands ?? []).join(", ") || "none"}`,
    `Requested risk: ${request.requested_risk_level ?? "write"}`,
    `Evidence refs: ${request.evidence_refs.join(", ")}`,
    `Request digest: ${digest}`,
  ].join("\n");
}
