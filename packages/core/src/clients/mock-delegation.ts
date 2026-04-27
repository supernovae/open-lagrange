import { deterministicProjectId, deterministicProjectRunId } from "../ids/deterministic-ids.js";
import { DelegationContext, type DelegationContext as DelegationContextType } from "../schemas/delegation.js";

export interface MockDelegationInput {
  readonly goal: string;
  readonly workspace_id?: string;
  readonly project_id?: string;
  readonly allowed_scopes?: readonly string[];
  readonly delegate_id?: string;
}

export function createMockDelegationContext(input: MockDelegationInput): DelegationContextType {
  const workspace_id = input.workspace_id ?? "workspace-local";
  const delegate_id = input.delegate_id ?? "open-lagrange-interface";
  const project_id = input.project_id ?? deterministicProjectId({
    goal: input.goal,
    workspace_id,
    principal_id: "human-local",
    delegate_id,
  });
  return DelegationContext.parse({
    principal_id: "human-local",
    principal_type: "human",
    delegate_id,
    delegate_type: "reconciler",
    project_id,
    workspace_id,
    allowed_scopes: [...(input.allowed_scopes ?? ["project:read", "project:summarize"])],
    denied_scopes: ["project:write"],
    allowed_capabilities: ["read_file", "search_docs", "draft_readme_summary"],
    max_risk_level: "read",
    approval_required_for: ["write", "destructive", "external_side_effect"],
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    trace_id: `trace_${project_id.replace(/^project_/, "")}`,
    parent_run_id: deterministicProjectRunId(project_id),
  });
}
