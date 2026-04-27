#!/usr/bin/env node
import { Command } from "commander";
import {
  DEFAULT_EXECUTION_BOUNDS,
  approveTask,
  createMockDelegationContext,
  deterministicProjectId,
  deterministicRepositoryTaskRunId,
  getProjectRunStatus,
  getTaskStatus,
  rejectTask,
  submitRepositoryTask,
  submitProjectRun,
  type ProjectReconcilerInput,
} from "@open-lagrange/core";

const program = new Command();

program
  .name("open-lagrange")
  .description("Submit and inspect Open Lagrange reconciliation workflow runs.");

program
  .command("submit")
  .description("Submit a project reconciliation workflow run.")
  .argument("<goal>", "User goal")
  .action(async (goal: string) => {
    const context = mockDelegationContext(goal);
    const input: ProjectReconcilerInput = {
      goal,
      delegation_context: context,
      bounds: DEFAULT_EXECUTION_BOUNDS,
    };
    const submitted = await submitProjectRun(input);
    console.log(JSON.stringify(submitted, null, 2));
  });

program
  .command("approve")
  .description("Approve a task that is waiting for review.")
  .argument("<taskId>", "Task ID or task run ID")
  .requiredOption("--reason <reason>", "Approval reason")
  .option("--approved-by <approvedBy>", "Approver identifier", "human-local")
  .action(async (taskId: string, options: { readonly reason: string; readonly approvedBy: string }) => {
    console.log(JSON.stringify(await approveTask({
      task_id: taskId,
      decided_by: options.approvedBy,
      reason: options.reason,
    }), null, 2));
  });

program
  .command("reject")
  .description("Reject a task that is waiting for review.")
  .argument("<taskId>", "Task ID or task run ID")
  .requiredOption("--reason <reason>", "Rejection reason")
  .option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local")
  .action(async (taskId: string, options: { readonly reason: string; readonly rejectedBy: string }) => {
    console.log(JSON.stringify(await rejectTask({
      task_id: taskId,
      decided_by: options.rejectedBy,
      reason: options.reason,
    }), null, 2));
  });

program
  .command("status")
  .description("Poll project reconciliation status.")
  .argument("<projectOrRunId>", "Project ID, project run ID, or Hatchet run ID")
  .action(async (projectOrRunId: string) => {
    console.log(JSON.stringify(await getProjectRunStatus(projectOrRunId), null, 2));
  });

program
  .command("run-demo")
  .description("Submit the README summary demo and poll until terminal status.")
  .action(async () => {
    const goal = "Create a short README summary for this repository.";
    const context = mockDelegationContext(goal);
    const submitted = await submitProjectRun({
      goal,
      delegation_context: context,
      bounds: DEFAULT_EXECUTION_BOUNDS,
    });
    console.log(JSON.stringify(submitted, null, 2));

    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(1000);
      const status = await getProjectRunStatus(submitted.hatchet_run_id);
      console.log(JSON.stringify(status, null, 2));
      const current = status.status?.status ?? normalizeHatchetStatus(status.hatchet_status);
      if (current === "requires_approval") {
        const task = status.task_statuses.find((item) => item.status === "requires_approval");
        if (task) {
          console.log(`Approve with: npm run cli -- approve ${task.task_run_id} --reason "Approved for demo"`);
          console.log(`Reject with: npm run cli -- reject ${task.task_run_id} --reason "Rejected for demo"`);
        }
      }
      if (current && isTerminal(current)) return;
    }
    throw new Error("Timed out waiting for workflow run completion.");
  });

const repo = program.command("repo").description("Run repository-scoped task workflows.");

repo
  .command("run")
  .requiredOption("--repo <path>", "Repository root")
  .requiredOption("--goal <goal>", "Repository task goal")
  .option("--workspace-id <workspaceId>", "Repository workspace ID")
  .option("--dry-run", "Plan and require approval before writes", true)
  .option("--apply", "Apply the approved patch immediately", false)
  .option("--require-approval", "Require approval before applying", false)
  .action(async (options: { readonly repo: string; readonly goal: string; readonly workspaceId?: string; readonly dryRun: boolean; readonly apply: boolean; readonly requireApproval: boolean }) => {
    const project_id = deterministicProjectId({
      goal: options.goal,
      workspace_id: options.workspaceId ?? "workspace-local",
      principal_id: "human-local",
      delegate_id: "open-lagrange-cli",
    });
    const context = createMockDelegationContext({
      goal: options.goal,
      project_id,
      delegate_id: "open-lagrange-cli",
      allowed_scopes: ["project:read", "project:summarize", "project:write"],
      ...(options.workspaceId ? { workspace_id: options.workspaceId } : {}),
    });
    const task_run_id = deterministicRepositoryTaskRunId({
      project_id,
      repo_root: options.repo,
      goal: options.goal,
    });
    console.log(JSON.stringify(await submitRepositoryTask({
      goal: options.goal,
      repo_root: options.repo,
      task_run_id,
      project_id,
      dry_run: options.dryRun && !options.apply,
      apply: options.apply,
      require_approval: options.requireApproval,
      ...(options.workspaceId ? { workspace_id: options.workspaceId } : {}),
      delegation_context: {
        ...context,
        allowed_capabilities: [
          "repo.list_files",
          "repo.read_file",
          "repo.search_text",
          "repo.propose_patch",
          "repo.apply_patch",
          "repo.run_verification",
          "repo.get_diff",
          "repo.create_review_report",
        ],
        max_risk_level: "external_side_effect",
        task_run_id,
      },
      verification_command_ids: ["npm_run_typecheck"],
    }), null, 2));
  });

repo
  .command("status")
  .argument("<taskId>", "Task ID or task run ID")
  .action(async (taskId: string) => {
    console.log(JSON.stringify(await getTaskStatus(taskId), null, 2));
  });

repo
  .command("diff")
  .argument("<taskId>", "Task ID or task run ID")
  .action(async (taskId: string) => {
    const status = await getTaskStatus(taskId);
    console.log(status?.repository_status?.diff_text ?? status?.repository_status?.diff_summary ?? "No diff recorded.");
  });

repo
  .command("review")
  .argument("<taskId>", "Task ID or task run ID")
  .action(async (taskId: string) => {
    const status = await getTaskStatus(taskId);
    console.log(JSON.stringify(status?.repository_status?.review_report ?? { message: "No review report recorded." }, null, 2));
  });

repo
  .command("approve")
  .argument("<taskId>", "Task ID or task run ID")
  .requiredOption("--reason <reason>", "Approval reason")
  .option("--approved-by <approvedBy>", "Approver identifier", "human-local")
  .action(async (taskId: string, options: { readonly reason: string; readonly approvedBy: string }) => {
    console.log(JSON.stringify(await approveTask({ task_id: taskId, decided_by: options.approvedBy, reason: options.reason }), null, 2));
  });

repo
  .command("reject")
  .argument("<taskId>", "Task ID or task run ID")
  .requiredOption("--reason <reason>", "Rejection reason")
  .option("--rejected-by <rejectedBy>", "Reviewer identifier", "human-local")
  .action(async (taskId: string, options: { readonly reason: string; readonly rejectedBy: string }) => {
    console.log(JSON.stringify(await rejectTask({ task_id: taskId, decided_by: options.rejectedBy, reason: options.reason }), null, 2));
  });

await program.parseAsync(process.argv);

function mockDelegationContext(goal: string) {
  return createMockDelegationContext({
    goal,
    delegate_id: "open-lagrange-cli",
  });
}

function normalizeHatchetStatus(status: string | undefined): string | undefined {
  if (!status) return undefined;
  const lower = status.toLowerCase();
  if (lower.includes("succeed") || lower.includes("complete")) return "completed";
  if (lower.includes("fail")) return "failed";
  if (lower.includes("cancel")) return "failed";
  return "running";
}

function isTerminal(status: string): boolean {
  return ["completed", "completed_with_errors", "yielded", "requires_approval", "failed"].includes(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
