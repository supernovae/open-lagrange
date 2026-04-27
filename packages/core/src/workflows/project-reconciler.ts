import type { Context } from "@hatchet-dev/typescript-sdk";
import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { deterministicProjectId, deterministicProjectRunId, deterministicTaskRunId } from "../ids/deterministic-ids.js";
import { observation, structuredError } from "../reconciliation/records.js";
import { DelegationContext } from "../schemas/delegation.js";
import {
  DEFAULT_EXECUTION_BOUNDS,
  ExecutionPlan,
  ProjectReconcilerInput,
  ProjectReconciliationResult,
  TaskReconciliationResult,
  type ExecutionBounds,
  type ProjectReconciliationResult as ProjectReconciliationResultType,
  type WorkflowStatus,
} from "../schemas/reconciliation.js";
import type { Observation, StructuredError } from "../schemas/open-cot.js";
import { generateExecutionPlanTask } from "../tasks/generate-execution-plan.js";
import { recordStatusTask } from "../tasks/record-status.js";
import { taskReconciler } from "./task-reconciler.js";

export const projectReconciler = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "project-reconciler",
  retries: 0,
  executionTimeout: "10m",
  fn: async (rawInput: HatchetJsonObject, ctx: Context<HatchetJsonObject>): Promise<HatchetJsonObject> => {
    const now = new Date().toISOString();
    const inputParsed = ProjectReconcilerInput.safeParse(rawInput);
    if (!inputParsed.success) {
      const item = structuredError({ code: "INVALID_DELEGATION_CONTEXT", message: inputParsed.error.message, now });
      return result({
        project_id: "project_invalid",
        project_run_id: "project_run_invalid",
        status: "failed",
        task_run_ids: [],
        task_results: [],
        observations: [],
        errors: [item],
        final_message: "Project input was invalid.",
      });
    }

    const requested = inputParsed.data;
    const project_id = requested.project_id ?? deterministicProjectId({
      goal: requested.goal,
      workspace_id: requested.delegation_context.workspace_id,
      principal_id: requested.delegation_context.principal_id,
      delegate_id: requested.delegation_context.delegate_id,
    });
    const project_run_id = deterministicProjectRunId(project_id);
    const delegation = DelegationContext.parse({
      ...requested.delegation_context,
      project_id,
      parent_run_id: project_run_id,
    });
    const bounds: ExecutionBounds = { ...DEFAULT_EXECUTION_BOUNDS, ...requested.bounds };

    await ctx.runChild(recordStatusTask, toHatchetJsonObject({
      kind: "project",
      snapshot: statusSnapshot({
        project_id,
        project_run_id,
        status: "planning",
        now,
        final_message: "Planning project.",
      }),
    }), { key: `${project_run_id}:status:planning` });

    const planCandidate = await ctx.runChild(generateExecutionPlanTask, toHatchetJsonObject({
      goal: requested.goal,
      delegation_context: delegation,
      ...(requested.metadata ? { metadata: requested.metadata } : {}),
      bounds,
    }), {
      key: `${project_run_id}:plan`,
      additionalMetadata: runMetadata({ project_id, project_run_id, trace_id: delegation.trace_id }),
    });
    const planParsed = ExecutionPlan.safeParse(planCandidate);
    if (!planParsed.success) {
      const item = structuredError({ code: "INVALID_PLAN", message: planParsed.error.message, now });
      await ctx.runChild(recordStatusTask, toHatchetJsonObject({
        kind: "project",
        snapshot: statusSnapshot({
          project_id,
          project_run_id,
          status: "failed",
          now,
          errors: [item],
          final_message: "Execution plan was invalid.",
        }),
      }), { key: `${project_run_id}:status:invalid-plan` });
      return result({
        project_id,
        project_run_id,
        status: "failed",
        task_run_ids: [],
        task_results: [],
        observations: [],
        errors: [item],
        final_message: "Execution plan was invalid.",
      });
    }

    const plan = planParsed.data;
    if (plan.tasks.length > bounds.max_tasks_per_project) {
      const item = structuredError({ code: "BUDGET_EXCEEDED", message: "Plan exceeds maximum task count", now });
      return result({
        project_id,
        project_run_id,
        status: "failed",
        plan,
        task_run_ids: [],
        task_results: [],
        observations: [],
        errors: [item],
        final_message: "Task count bound exceeded.",
      });
    }

    const taskRunIds = plan.tasks.map((task, index) =>
      deterministicTaskRunId({
        project_id,
        plan_version: plan.plan_version,
        task_index: index,
        task_title: task.title,
      }),
    );

    await ctx.runChild(recordStatusTask, toHatchetJsonObject({
      kind: "project",
      snapshot: statusSnapshot({
        project_id,
        project_run_id,
        status: "running",
        now,
        task_run_ids: taskRunIds,
        observations: [observation({ status: "recorded", summary: "Execution plan validated.", now })],
        final_message: "Running scoped task workflows.",
      }),
    }), { key: `${project_run_id}:status:running` });

    const taskResults: TaskReconciliationResult[] = [];
    for (const [index, task] of plan.tasks.entries()) {
      const task_run_id = taskRunIds[index];
      if (!task_run_id) continue;
      const taskResultCandidate = await ctx.runChild(taskReconciler, toHatchetJsonObject({
        parent_project_id: project_id,
        parent_project_run_id: project_run_id,
        task_run_id,
        scoped_task: task,
        delegation_context: { ...delegation, task_run_id },
        bounds,
      }), {
        key: task_run_id,
        additionalMetadata: runMetadata({ project_id, project_run_id, task_run_id, trace_id: delegation.trace_id }),
      });
      const taskResult = TaskReconciliationResult.parse(taskResultCandidate);
      taskResults.push(taskResult);
      await ctx.runChild(recordStatusTask, toHatchetJsonObject({
        kind: "task",
        snapshot: {
          project_id,
          task_id: taskResult.task_id,
          task_run_id: taskResult.task_run_id,
          status: taskResult.status,
          observations: taskResult.observations,
          errors: taskResult.errors,
          final_message: taskResult.final_message,
          result: taskResult,
          updated_at: new Date().toISOString(),
        },
      }), { key: `${task_run_id}:status:final` });
      await ctx.runChild(recordStatusTask, toHatchetJsonObject({
        kind: "project",
        snapshot: statusSnapshot({
          project_id,
          project_run_id,
          status: "running",
          now: new Date().toISOString(),
          task_run_ids: taskRunIds,
          observations: taskResults.flatMap((item) => item.observations),
          errors: taskResults.flatMap((item) => item.errors),
          final_message: `Completed ${taskResults.length} of ${plan.tasks.length} task workflows.`,
        }),
      }), { key: `${project_run_id}:status:task-${index}` });
    }

    const status = aggregateStatus(taskResults);
    const observations = taskResults.flatMap((item) => item.observations);
    const errors = taskResults.flatMap((item) => item.errors);
    const final_message = finalMessage(status, taskResults.map((item) => item.final_message));

    await ctx.runChild(recordStatusTask, toHatchetJsonObject({
      kind: "project",
      snapshot: statusSnapshot({
        project_id,
        project_run_id,
        status,
        now: new Date().toISOString(),
        task_run_ids: taskRunIds,
        observations,
        errors,
        final_message,
      }),
    }), { key: `${project_run_id}:status:final` });

    return result({
      project_id,
      project_run_id,
      status,
      plan,
      task_run_ids: taskRunIds,
      task_results: taskResults,
      observations,
      errors,
      final_message,
    });
  },
});

function result(input: ProjectReconciliationResultType): HatchetJsonObject {
  return toHatchetJsonObject(ProjectReconciliationResult.parse(input));
}

function aggregateStatus(results: readonly { readonly status: ProjectReconciliationResultType["status"] }[]): ProjectReconciliationResultType["status"] {
  if (results.some((result) => result.status === "requires_approval")) return "requires_approval";
  if (results.some((result) => result.status === "failed")) return "failed";
  if (results.some((result) => result.status === "yielded")) return "yielded";
  if (results.some((result) => result.status === "completed_with_errors")) return "completed_with_errors";
  return "completed";
}

function finalMessage(
  status: ProjectReconciliationResultType["status"],
  taskMessages: readonly string[],
): string {
  if (status === "completed") return taskMessages.join(" ");
  if (status === "requires_approval") return "Project requires approval before continuing.";
  if (status === "yielded") return "Project yielded safely.";
  if (status === "completed_with_errors") return "Project completed with errors.";
  return "Project failed.";
}

function statusSnapshot(input: {
  readonly project_id: string;
  readonly project_run_id: string;
  readonly status: WorkflowStatus;
  readonly now: string;
  readonly task_run_ids?: readonly string[];
  readonly observations?: readonly Observation[];
  readonly errors?: readonly StructuredError[];
  readonly final_message?: string;
}) {
  return {
    project_id: input.project_id,
    project_run_id: input.project_run_id,
    status: input.status,
    task_run_ids: [...(input.task_run_ids ?? [])],
    observations: [...(input.observations ?? [])],
    errors: [...(input.errors ?? [])],
    final_message: input.final_message,
    updated_at: input.now,
  };
}

function runMetadata(input: {
  readonly project_id: string;
  readonly project_run_id: string;
  readonly task_run_id?: string;
  readonly trace_id: string;
}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
