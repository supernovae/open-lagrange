import { createMockDelegationContext, deterministicProjectId, deterministicRepositoryTaskRunId, submitRepositoryTask } from "@open-lagrange/core/interface";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../http";
import { SubmitRepositoryJobPayload } from "./schema";
import { assertAllowedRepoRoot } from "../security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireMutationSecurity(request);
    const payload = await parseJson(request, SubmitRepositoryJobPayload);
    assertAllowedRepoRoot(payload.repo_root);
    const project_id = deterministicProjectId({
      goal: payload.goal,
      workspace_id: payload.workspace_id ?? "workspace-local",
      principal_id: "human-local",
      delegate_id: "open-lagrange-web",
    });
    const task_run_id = deterministicRepositoryTaskRunId({ project_id, repo_root: payload.repo_root, goal: payload.goal });
    const delegation_context = createMockDelegationContext({
      goal: payload.goal,
      project_id,
      delegate_id: "open-lagrange-web",
      allowed_scopes: ["project:read", "project:summarize", "project:write"],
      ...(payload.workspace_id ? { workspace_id: payload.workspace_id } : {}),
    });
    const submitted = await submitRepositoryTask({
      goal: payload.goal,
      repo_root: payload.repo_root,
      task_run_id,
      project_id,
      dry_run: payload.dry_run && !payload.apply,
      apply: payload.apply,
      require_approval: payload.require_approval,
      ...(payload.workspace_id ? { workspace_id: payload.workspace_id } : {}),
      delegation_context: {
        ...delegation_context,
        allowed_capabilities: ["repo.list_files", "repo.read_file", "repo.search_text", "repo.propose_patch", "repo.apply_patch", "repo.run_verification", "repo.get_diff", "repo.create_review_report"],
        max_risk_level: "external_side_effect",
        task_run_id,
      },
      verification_command_ids: ["npm_run_typecheck"],
    });
    return json({ ...submitted, status_url: `/api/tasks/${submitted.task_run_id}` }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
