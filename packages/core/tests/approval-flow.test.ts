import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { approvalTokenForRequest, verifyApprovalToken } from "../src/approval/approval-token.js";
import { createSqliteStateStore } from "../src/storage/sqlite-state-store.js";
import type { ApprovalContinuationContext, ApprovalContinuationEnvelope, ApprovalRequest, WorkflowStatusSnapshot } from "../src/schemas/reconciliation.js";

const now = "2026-04-27T16:00:00.000Z";

describe("approval state", () => {
  it("records approval decisions", async () => {
    const store = createSqliteStateStore({ path: join(tmpdir(), `open-lagrange-${Date.now()}-approval.sqlite`) });
    const request = approvalRequest();

    await store.createApprovalRequest(request);
    const decision = await store.approveRequest(request.approval_request_id, "reviewer-local", now, "Looks bounded");

    expect(decision).toMatchObject({
      approval_request_id: request.approval_request_id,
      decision: "approved",
      approved_by: "reviewer-local",
      reason: "Looks bounded",
    });
    expect(decision?.approval_token_hash).toBeDefined();
    expect(verifyApprovalToken(request.approval_request_id, approvalTokenForRequest(request.approval_request_id), decision?.approval_token_hash ?? "")).toBe(true);
  });

  it("stores continuation context without mutating the approved intent", async () => {
    const store = createSqliteStateStore({ path: join(tmpdir(), `open-lagrange-${Date.now()}-continuation.sqlite`) });
    const context = continuationContext();

    await store.recordContinuationContext(context);
    const stored = await store.getContinuationContext(context.approval_request.approval_request_id);

    expect(stored?.intent).toEqual(context.intent);
    expect(stored?.intent.arguments).toEqual({ title: "README", source_summary: "source" });
  });

  it("stores typed continuation envelopes without mutating payloads", async () => {
    const store = createSqliteStateStore({ path: join(tmpdir(), `open-lagrange-${Date.now()}-envelope.sqlite`) });
    const envelope = continuationEnvelope();

    await store.recordApprovalContinuationEnvelope(envelope);
    const stored = await store.getApprovalContinuationEnvelope(envelope.approval_request.approval_request_id);

    expect(stored?.kind).toBe("repository_patch");
    expect(stored?.payload).toEqual(envelope.payload);
  });

  it("lists task statuses for project status responses", async () => {
    const store = createSqliteStateStore({ path: join(tmpdir(), `open-lagrange-${Date.now()}-status.sqlite`) });
    const projectStatus: WorkflowStatusSnapshot = {
      project_id: "project-test",
      project_run_id: "project-run-test",
      status: "running",
      task_run_ids: ["task-run-test"],
      observations: [],
      errors: [],
      updated_at: now,
    };
    await store.recordProjectStatus(projectStatus);
    await store.recordTaskStatus({
      project_id: "project-test",
      task_id: "task-test",
      task_run_id: "task-run-test",
      status: "requires_approval",
      observations: [],
      errors: [],
      updated_at: now,
    });

    await expect(store.listTaskStatusesForProject("project-test")).resolves.toHaveLength(1);
  });

  it("records rejection decisions", async () => {
    const store = createSqliteStateStore({ path: join(tmpdir(), `open-lagrange-${Date.now()}-reject.sqlite`) });
    const request = approvalRequest();

    await store.createApprovalRequest(request);
    const decision = await store.rejectRequest(request.approval_request_id, "reviewer-local", now, "Too broad");

    expect(decision).toMatchObject({
      approval_request_id: request.approval_request_id,
      decision: "rejected",
      rejected_by: "reviewer-local",
      reason: "Too broad",
    });
  });
});

function approvalRequest(): ApprovalRequest {
  return {
    approval_request_id: "approval-request-test",
    task_id: "task-test",
    project_id: "project-test",
    intent_id: "intent-test",
    requested_risk_level: "write",
    requested_capability: "write_note",
    task_run_id: "task-run-test",
    requested_at: now,
    prompt: "Approve write_note for task",
    trace_id: "trace-test",
  };
}

function continuationEnvelope(): ApprovalContinuationEnvelope {
  const request = {
    ...approvalRequest(),
    requested_capability: "repo.apply_patch",
    intent_id: "patch-plan-test",
  };
  return {
    kind: "repository_patch",
    approval_request: request,
    project_id: request.project_id,
    task_run_id: request.task_run_id,
    trace_id: request.trace_id,
    payload: {
      patch_plan_id: "patch-plan-test",
      idempotency_key: "repo-idem-test",
      files: [{ relative_path: "README.md", operation: "modify", append_text: "\nTest\n", rationale: "Fixture" }],
    },
  };
}

function continuationContext(): ApprovalContinuationContext {
  const request = approvalRequest();
  const intent = {
    intent_id: request.intent_id,
    snapshot_id: "caps-test",
    endpoint_id: "mock.project",
    capability_name: request.requested_capability,
    capability_digest: "a".repeat(64),
    risk_level: "write" as const,
    requires_approval: true,
    idempotency_key: "idem-test",
    arguments: { title: "README", source_summary: "source" },
  };
  return {
    approval_request: request,
    parent_project_id: request.project_id,
    parent_project_run_id: "project-run-test",
    task_run_id: request.task_run_id,
    scoped_task: {
      task_id: request.task_id,
      title: "Write note",
      objective: "Write a note",
      allowed_scopes: ["project:write"],
      allowed_capabilities: ["write_note"],
      max_risk_level: "write",
    },
    delegation_context: {
      principal_id: "human-local",
      principal_type: "human",
      delegate_id: "open-lagrange-test",
      delegate_type: "reconciler",
      project_id: request.project_id,
      workspace_id: "workspace-local",
      allowed_scopes: ["project:write"],
      denied_scopes: [],
      allowed_capabilities: ["write_note"],
      max_risk_level: "write",
      approval_required_for: ["write"],
      expires_at: "2026-04-27T17:00:00.000Z",
      trace_id: request.trace_id,
      parent_run_id: "project-run-test",
      task_run_id: request.task_run_id,
    },
    bounds: {
      max_tasks_per_project: 3,
      max_execution_intents_per_task: 2,
      max_total_endpoint_attempts: 2,
      max_critic_passes: 1,
      max_risk_without_approval: "read",
    },
    capability_snapshot: {
      snapshot_id: intent.snapshot_id,
      created_at: now,
      capabilities_hash: "b".repeat(64),
      capabilities: [{
        endpoint_id: intent.endpoint_id,
        capability_name: intent.capability_name,
        description: "Write note",
        input_schema: { type: "object" },
        risk_level: intent.risk_level,
        requires_approval: intent.requires_approval,
        capability_digest: intent.capability_digest,
      }],
    },
    artifact: {
      artifact_id: "artifact-test",
      schema_version: "open-cot.core.v1",
      capability_snapshot_id: intent.snapshot_id,
      intent_verification: {
        objective: "Write a note",
        request_boundaries: [],
        allowed_scope: ["project:write"],
        prohibited_scope: [],
      },
      assumptions: [],
      reasoning_trace: {
        evidence_mode: "audit_summary",
        summary: "Approved fixture",
        steps: [],
      },
      execution_intents: [intent],
      observations: [],
      uncertainty: { level: "low", explanation: "Fixture" },
    },
    intent,
  };
}
