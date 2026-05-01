import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStateStore } from "../storage/state-store.js";
import { Planfile, type Planfile as PlanfileType } from "../planning/planfile-schema.js";
import { ScopeExpansionApprovalPayload, markScopeExpansionRequest, scopeExpansionRequestDigest, type PersistedScopeExpansionRequest } from "./scope-expansion.js";
import { ScopeExpansionError } from "./scope-expansion-errors.js";
import { readRepositoryPlanStatus, writeRepositoryPlanStatus, type RepositoryPlanStatus } from "./repository-status.js";

export interface ScopeExpansionResumeContext {
  readonly planfile: PlanfileType;
  readonly status: RepositoryPlanStatus;
  readonly request: PersistedScopeExpansionRequest;
  readonly requested_files: readonly string[];
  readonly requested_capabilities: readonly string[];
  readonly requested_verification_commands: readonly string[];
}

export async function loadApprovedScopeExpansionForResume(planId: string): Promise<ScopeExpansionResumeContext> {
  const status = readRepositoryPlanStatus(planId);
  if (!status) throw new ScopeExpansionError("SCOPE_REQUEST_NOT_FOUND", `Repository plan status was not found for ${planId}.`);
  if (!status.worktree_session) throw new ScopeExpansionError("SCOPE_RESUME_NOT_READY", "Repository plan has no worktree session to resume.");
  const pending = status.scope_expansion_requests.find((item) => item.request.status !== "applied" && (item.request.status === "pending_approval" || item.approval_status === "approved"));
  if (!pending) throw new ScopeExpansionError("SCOPE_REQUEST_NOT_FOUND", "No pending scope expansion request is available to resume.");
  const envelope = await getStateStore().getApprovalContinuationEnvelope(pending.approval_request_id);
  if (!envelope || envelope.kind !== "scope_expansion") throw new ScopeExpansionError("SCOPE_APPROVAL_MISSING", `Approval continuation is missing for ${pending.approval_request_id}.`);
  const payload = ScopeExpansionApprovalPayload.parse(envelope.payload);
  const decision = await getStateStore().getApprovalDecision(pending.approval_request_id);
  if (!decision) throw new ScopeExpansionError("SCOPE_APPROVAL_MISSING", `Approval decision is missing for ${pending.approval_request_id}.`);
  if (decision.decision === "rejected") throw new ScopeExpansionError("SCOPE_APPROVAL_REJECTED", `Scope expansion was rejected: ${decision.reason ?? "no reason provided"}`);
  if (decision.decision !== "approved") throw new ScopeExpansionError("SCOPE_APPROVAL_MISSING", `Scope expansion is still waiting for approval: ${pending.approval_request_id}.`);
  if (scopeExpansionRequestDigest(pending.request) !== payload.request_digest) {
    throw new ScopeExpansionError("SCOPE_APPROVAL_STALE", "Scope expansion approval does not match the current request digest.");
  }
  const executionPath = join(status.worktree_session.repo_root, ".open-lagrange", "runs", planId, "plan.execution.json");
  if (!existsSync(executionPath)) throw new ScopeExpansionError("SCOPE_RESUME_NOT_READY", `Execution plan copy is missing at ${executionPath}.`);
  return {
    planfile: Planfile.parse(JSON.parse(readFileSync(executionPath, "utf8"))),
    status,
    request: pending.request,
    requested_files: payload.requested_files,
    requested_capabilities: payload.requested_capabilities,
    requested_verification_commands: payload.requested_verification_commands,
  };
}

export function markScopeExpansionApplied(input: {
  readonly status: RepositoryPlanStatus;
  readonly request_id: string;
  readonly now?: string;
}): RepositoryPlanStatus {
  const now = input.now ?? new Date().toISOString();
  return writeRepositoryPlanStatus({
    ...input.status,
    scope_expansion_requests: input.status.scope_expansion_requests.map((item) =>
      item.request.request_id === input.request_id
        ? {
            ...item,
            request: markScopeExpansionRequest(item.request, "applied", now),
            approval_status: "approved",
            resume_status: "applied",
          }
        : item,
    ),
    updated_at: now,
  });
}
