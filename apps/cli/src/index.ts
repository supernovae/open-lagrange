#!/usr/bin/env node
import { Command } from "commander";
import {
  DEFAULT_EXECUTION_BOUNDS,
  DelegationContext,
  deterministicProjectId,
  deterministicProjectRunId,
  getProjectRunStatus,
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
      if (current && isTerminal(current)) return;
    }
    throw new Error("Timed out waiting for workflow run completion.");
  });

await program.parseAsync(process.argv);

function mockDelegationContext(goal: string): DelegationContext {
  const base = {
    goal,
    workspace_id: "workspace-local",
    principal_id: "human-local",
    delegate_id: "open-lagrange-cli",
  };
  const project_id = deterministicProjectId(base);
  const parent_run_id = deterministicProjectRunId(project_id);
  return DelegationContext.parse({
    principal_id: base.principal_id,
    principal_type: "human",
    delegate_id: base.delegate_id,
    delegate_type: "reconciler",
    project_id,
    workspace_id: base.workspace_id,
    allowed_scopes: ["project:read", "project:summarize"],
    denied_scopes: ["project:write"],
    allowed_capabilities: ["read_file", "search_docs", "draft_readme_summary"],
    max_risk_level: "read",
    approval_required_for: ["write", "destructive", "external_side_effect"],
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    trace_id: `trace_${project_id.replace(/^project_/, "")}`,
    parent_run_id,
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
