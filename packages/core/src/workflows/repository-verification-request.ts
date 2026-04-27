import type { Context } from "@hatchet-dev/typescript-sdk";
import { z } from "zod";
import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { createMockDelegationContext } from "../clients/mock-delegation.js";
import { observation } from "../reconciliation/records.js";
import { CapabilitySnapshot } from "../schemas/capabilities.js";
import { RepositoryTaskInput, RepositoryTaskStatus, RepositoryWorkspace, VerificationReport } from "../schemas/repository.js";
import { discoverRepositoryCapabilitiesTask } from "../tasks/repository-capabilities.js";
import { loadRepositoryWorkspaceTask } from "../tasks/load-repository-workspace.js";
import { recordStatusTask } from "../tasks/record-status.js";
import { runRepositoryVerificationTask } from "../tasks/repository-verify.js";

export const RepositoryVerificationRequestInput = z.object({
  project_id: z.string().min(1),
  task_run_id: z.string().min(1),
  repo_root: z.string().min(1),
  workspace_id: z.string().min(1),
  command_id: z.string().min(1),
}).strict();

export type RepositoryVerificationRequestInput = z.infer<typeof RepositoryVerificationRequestInput>;

export const repositoryVerificationRequest = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "repository-verification-request",
  retries: 0,
  executionTimeout: "5m",
  fn: async (rawInput: HatchetJsonObject, ctx: Context<HatchetJsonObject>): Promise<HatchetJsonObject> => {
    const input = RepositoryVerificationRequestInput.parse(rawInput);
    const delegation_context = {
      ...createMockDelegationContext({
        goal: `Run repository verification ${input.command_id}`,
        project_id: input.project_id,
        workspace_id: input.workspace_id,
        delegate_id: "open-lagrange-tui",
        allowed_scopes: ["repository:read", "repository:verify"],
      }),
      allowed_capabilities: ["repo.run_verification"],
      max_risk_level: "external_side_effect" as const,
      task_run_id: input.task_run_id,
    };
    const taskInput = RepositoryTaskInput.parse({
      goal: `Run repository verification ${input.command_id}`,
      repo_root: input.repo_root,
      workspace_id: input.workspace_id,
      task_run_id: input.task_run_id,
      project_id: input.project_id,
      dry_run: true,
      apply: false,
      delegation_context,
      verification_command_ids: [input.command_id],
    });
    const workspace = RepositoryWorkspace.parse(await ctx.runChild(loadRepositoryWorkspaceTask, toHatchetJsonObject(taskInput), {
      key: `${input.task_run_id}:user-frame:workspace:${input.command_id}`,
    }));
    const snapshot = CapabilitySnapshot.parse(await ctx.runChild(discoverRepositoryCapabilitiesTask, toHatchetJsonObject({
      workspace,
      delegation_context,
      now: new Date().toISOString(),
    }), {
      key: `${input.task_run_id}:user-frame:caps:${input.command_id}`,
    }));
    const verification = VerificationReport.parse(await ctx.runChild(runRepositoryVerificationTask, toHatchetJsonObject({
      workspace,
      command_ids: [input.command_id],
      delegation_context,
      task_run_id: input.task_run_id,
      snapshot_id: snapshot.snapshot_id,
    }), {
      key: `${input.task_run_id}:user-frame:verify:${input.command_id}`,
    }));
    await ctx.runChild(recordStatusTask, toHatchetJsonObject({
      kind: "task",
      snapshot: {
        project_id: input.project_id,
        task_id: "repository-task",
        task_run_id: input.task_run_id,
        status: verification.passed ? "completed" : "completed_with_errors",
        observations: [observation({
          status: "recorded",
          summary: `Requested verification completed: ${input.command_id}`,
          now: new Date().toISOString(),
          task_id: input.task_run_id,
          output: verification,
        })],
        errors: [],
        final_message: verification.summary,
        repository_status: RepositoryTaskStatus.parse({
          workspace_id: workspace.workspace_id,
          repo_root: workspace.repo_root,
          current_phase: verification.passed ? "completed" : "completed_with_errors",
          inspected_files: [],
          planned_files: [],
          changed_files: [],
          verification_results: verification.results,
          errors: [],
          observations: [observation({
            status: "recorded",
            summary: `Requested verification completed: ${input.command_id}`,
            now: new Date().toISOString(),
            task_id: input.task_run_id,
            output: verification,
          })],
        }),
        updated_at: new Date().toISOString(),
      },
    }), {
      key: `${input.task_run_id}:user-frame:status:${input.command_id}`,
    });
    return toHatchetJsonObject(verification);
  },
});
