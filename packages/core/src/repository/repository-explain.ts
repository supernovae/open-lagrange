import { listArtifactsForPlan } from "../artifacts/index.js";
import { listModelCallArtifactsForPlan } from "../models/model-call-indexing.js";
import { readRepositoryPlanStatus } from "./repository-status.js";

export interface RepositoryPlanExplanation {
  readonly plan_id: string;
  readonly status: string;
  readonly goal: string;
  readonly current_node?: string;
  readonly worktree_path?: string;
  readonly changed_files: readonly string[];
  readonly phases: readonly {
    readonly node_id: string;
    readonly status: string;
    readonly artifact_refs: readonly string[];
    readonly errors: readonly string[];
  }[];
  readonly artifacts: readonly {
    readonly artifact_id: string;
    readonly kind: string;
    readonly title: string;
    readonly summary: string;
  }[];
  readonly model_calls: readonly {
    readonly artifact_id: string;
    readonly role: string;
    readonly model: string;
    readonly status: string;
    readonly tokens: number;
  }[];
  readonly verification: {
    readonly report_ids: readonly string[];
    readonly summary: string;
  };
  readonly final_patch_artifact_id?: string;
  readonly yielded?: {
    readonly reason?: string;
    readonly remediation?: string;
    readonly suggested_next_command?: string;
  };
}

export function explainRepositoryPlan(planId: string): RepositoryPlanExplanation | undefined {
  const status = readRepositoryPlanStatus(planId);
  if (!status) return undefined;
  const artifacts = listArtifactsForPlan(planId);
  const modelCalls = listModelCallArtifactsForPlan(planId);
  const phases = status.plan_state?.node_states.map((node) => ({
    node_id: node.node_id,
    status: node.status,
    artifact_refs: node.artifacts.map((artifact) => artifact.artifact_id),
    errors: node.errors,
  })) ?? [];
  return {
    plan_id: planId,
    status: status.status,
    goal: goalFromStatus(status.plan_state?.markdown_projection) ?? artifacts.find((artifact) => artifact.kind === "planfile")?.summary ?? "Repository Plan-to-Patch run",
    ...(status.current_node ? { current_node: status.current_node } : {}),
    ...(status.worktree_session?.worktree_path ? { worktree_path: status.worktree_session.worktree_path } : {}),
    changed_files: status.changed_files,
    phases,
    artifacts: artifacts.map((artifact) => ({
      artifact_id: artifact.artifact_id,
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary,
    })),
    model_calls: modelCalls.map((call) => ({
      artifact_id: call.artifact_id,
      role: call.role,
      model: call.model,
      status: call.status,
      tokens: call.token_usage.total_tokens ?? 0,
    })),
    verification: {
      report_ids: status.verification_report_ids,
      summary: status.verification_report_ids.length > 0
        ? `${status.verification_report_ids.length} verification report(s) recorded.`
        : "No verification report recorded.",
    },
    ...(status.final_patch_artifact_id ? { final_patch_artifact_id: status.final_patch_artifact_id } : {}),
    ...(status.status === "yielded" ? {
      yielded: {
        ...(status.yielded_reason ? { reason: status.yielded_reason } : {}),
        ...(status.remediation ? { remediation: status.remediation } : {}),
        ...(status.suggested_next_command ? { suggested_next_command: status.suggested_next_command } : {}),
      },
    } : {}),
  };
}

function goalFromStatus(markdown: string | undefined): string | undefined {
  if (!markdown) return undefined;
  const match = /interpreted_goal:\s*(.+)/.exec(markdown);
  return match?.[1]?.trim().replace(/^["']|["']$/g, "");
}
