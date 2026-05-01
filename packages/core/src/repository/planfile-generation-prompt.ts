import type { GoalFrame } from "../planning/goal-frame.js";
import type { VerificationPolicy } from "./verification-policy.js";
import type { RepositoryMetadataSummary } from "./model-goal-frame-generator.js";

export interface PlanningPolicy {
  readonly mode: "dry_run" | "apply";
  readonly require_write_approval: boolean;
  readonly allow_destructive_nodes: boolean;
}

export interface CapabilitySnapshotForPlanning {
  readonly capability_refs: readonly string[];
}

export function planfileGenerationSystemPrompt(): string {
  return [
    "Emit a Planfile JSON object only.",
    "You cannot inspect the repository directly.",
    "Use only the GoalFrame, repository metadata, capability snapshot, and verification policy provided.",
    "Do not invent capabilities or verification command IDs.",
    "Keep the DAG minimal for simple tasks.",
    "Write and external-side-effect nodes must require approval.",
    "Do not add destructive nodes unless the planning policy explicitly allows them.",
  ].join("\n");
}

export function buildPlanfileGenerationPrompt(input: {
  readonly goal_frame: GoalFrame;
  readonly repo_metadata: RepositoryMetadataSummary;
  readonly available_capabilities: CapabilitySnapshotForPlanning;
  readonly verification_policy: VerificationPolicy;
  readonly planning_policy: PlanningPolicy;
  readonly plan_id: string;
  readonly repo_root: string;
  readonly now: string;
}): string {
  return JSON.stringify({
    plan_id: input.plan_id,
    schema_version: "open-lagrange.plan.v1",
    goal_frame: input.goal_frame,
    repo_metadata: input.repo_metadata,
    available_capabilities: input.available_capabilities,
    verification_policy: input.verification_policy,
    planning_policy: input.planning_policy,
    execution_context: {
      repository: {
        repo_root: input.repo_root.replace(/\/Users\/[^/\s]+/g, "/Users/[redacted]"),
        verification_command_ids: input.verification_policy.allowed_commands.map((command) => command.command_id),
      },
    },
    suggested_nodes: [
      "frame_goal",
      "inspect_repo",
      "inspect_relevant_files",
      "design_change",
      "patch_repo",
      "verify_repo",
      "repair_repo",
      "review_repo",
      "export_patch",
    ],
    now: input.now,
  });
}

