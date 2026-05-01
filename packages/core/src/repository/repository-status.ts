import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { PlanState } from "../planning/plan-state.js";
import { WorktreeSession } from "./worktree-session.js";

export const RepositoryPlanStatus = z.object({
  schema_version: z.literal("open-lagrange.repository-status.v1"),
  plan_id: z.string().min(1),
  status: z.enum(["pending", "running", "completed", "failed", "yielded"]),
  current_node: z.string().optional(),
  worktree_session: WorktreeSession.optional(),
  plan_state: PlanState.optional(),
  artifact_refs: z.array(z.string()),
  changed_files: z.array(z.string()),
  evidence_bundle_ids: z.array(z.string()),
  patch_plan_ids: z.array(z.string()),
  patch_artifact_ids: z.array(z.string()),
  verification_report_ids: z.array(z.string()),
  repair_attempt_ids: z.array(z.string()),
  review_report_id: z.string().optional(),
  final_patch_artifact_id: z.string().optional(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).strict();

export type RepositoryPlanStatus = z.infer<typeof RepositoryPlanStatus>;

export function createRepositoryPlanStatus(input: {
  readonly plan_id: string;
  readonly now?: string;
}): RepositoryPlanStatus {
  const now = input.now ?? new Date().toISOString();
  return RepositoryPlanStatus.parse({
    schema_version: "open-lagrange.repository-status.v1",
    plan_id: input.plan_id,
    status: "pending",
    artifact_refs: [],
    changed_files: [],
    evidence_bundle_ids: [],
    patch_plan_ids: [],
    patch_artifact_ids: [],
    verification_report_ids: [],
    repair_attempt_ids: [],
    errors: [],
    warnings: [],
    created_at: now,
    updated_at: now,
  });
}

export function repositoryStatusPath(planId: string, repoRoot?: string): string {
  return resolve(repoRoot ?? process.env.INIT_CWD ?? process.cwd(), join(".open-lagrange", "runs", planId, "repository-status.json"));
}

export function readRepositoryPlanStatus(planId: string): RepositoryPlanStatus | undefined {
  const path = repositoryStatusPath(planId);
  if (!existsSync(path)) return undefined;
  return RepositoryPlanStatus.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function writeRepositoryPlanStatus(status: RepositoryPlanStatus): RepositoryPlanStatus {
  const parsed = RepositoryPlanStatus.parse(status);
  const path = repositoryStatusPath(parsed.plan_id, parsed.worktree_session?.repo_root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(parsed, null, 2), "utf8");
  return parsed;
}

export function updateRepositoryPlanStatus(
  status: RepositoryPlanStatus,
  patch: Partial<Omit<RepositoryPlanStatus, "schema_version" | "plan_id" | "created_at">>,
  now = new Date().toISOString(),
): RepositoryPlanStatus {
  return RepositoryPlanStatus.parse({
    ...status,
    ...patch,
    updated_at: now,
  });
}
