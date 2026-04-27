import { stableHash } from "../util/hash.js";

function id(prefix: string, value: unknown, length = 24): string {
  return `${prefix}_${stableHash(value).slice(0, length)}`;
}

export function deterministicProjectId(input: {
  readonly goal: string;
  readonly workspace_id: string;
  readonly principal_id: string;
  readonly delegate_id: string;
}): string {
  return id("project", {
    goal: input.goal.trim().replace(/\s+/g, " ").toLowerCase(),
    workspace_id: input.workspace_id,
    principal_id: input.principal_id,
    delegate_id: input.delegate_id,
  });
}

export function deterministicProjectRunId(projectId: string): string {
  return `project_run_${projectId.replace(/^project_/, "")}`;
}

export function deterministicTaskRunId(input: {
  readonly project_id: string;
  readonly plan_version: string;
  readonly task_index: number;
  readonly task_title: string;
}): string {
  return id("task_run", input);
}

export function deterministicSnapshotId(input: unknown): string {
  return id("caps", input, 16);
}

export function deterministicIntentId(input: unknown): string {
  return id("intent", input, 16);
}

export function deterministicIdempotencyKey(input: unknown): string {
  return id("idem", input, 24);
}

export function deterministicObservationId(input: unknown): string {
  return id("observation", input, 16);
}

export function deterministicReconciliationId(input: unknown): string {
  return id("reconciliation", input, 16);
}
