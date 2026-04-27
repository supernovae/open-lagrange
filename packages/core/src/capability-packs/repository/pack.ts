import type { CapabilityDefinition, CapabilityPack, PackExecutionContext } from "@open-lagrange/capability-sdk";
import { z } from "zod";
import { PatchPreview, AppliedPatchResult } from "../../schemas/patch-plan.js";
import { DiffReport, RepositoryFileInfo, RepositoryFileRead, RepositorySearchMatch, RepositoryWorkspace, ReviewReport, VerificationReport, type RepositoryWorkspace as RepositoryWorkspaceType } from "../../schemas/repository.js";
import {
  ApplyPatchInput,
  CreateReviewReportInput,
  GetDiffInput,
  ListFilesInput,
  ProposePatchInput,
  ReadFileInput,
  RunVerificationInput,
  SearchTextInput,
} from "./schemas.js";
import {
  applyRepositoryPatch,
  createRepositoryReviewReport,
  getRepositoryDiffReport,
  listRepositoryFiles,
  proposeRepositoryPatch,
  readRepositoryFile,
  runRepositoryVerificationReport,
  searchRepositoryText,
} from "./executor.js";

const PACK_ID = "open-lagrange.repository";

export const repositoryPack: CapabilityPack = {
  manifest: {
    pack_id: PACK_ID,
    name: "Repository Task Pack",
    version: "0.1.0",
    description: "Repo-scoped file inspection, patching, verification, diff, and review capabilities.",
    publisher: "open-lagrange",
    license: "MIT",
    runtime_kind: "local_trusted",
    trust_level: "trusted_core",
    required_scopes: ["project:read"],
    provided_scopes: ["repository:read", "repository:write", "repository:verify"],
    default_policy: { static_registration_only: true },
    open_cot_alignment: { extension_candidate: "repository-task" },
  },
  capabilities: [
    capability({
      name: "repo.list_files",
      description: "List repository files under the path policy.",
      input_schema: ListFilesInput,
      output_schema: z.array(RepositoryFileInfo),
      risk_level: "read",
      side_effect_kind: "filesystem_read",
      requires_approval: false,
      scopes: ["repository:read"],
      execute: (context, input) => listRepositoryFiles(workspaceFromContext(context), {
        relative_path: input.relative_path,
        ...(input.max_results === undefined ? {} : { max_results: input.max_results }),
      }),
    }),
    capability({
      name: "repo.read_file",
      description: "Read one repository file under the path policy.",
      input_schema: ReadFileInput,
      output_schema: RepositoryFileRead,
      risk_level: "read",
      side_effect_kind: "filesystem_read",
      requires_approval: false,
      scopes: ["repository:read"],
      execute: (context, input) => readRepositoryFile(workspaceFromContext(context), input),
    }),
    capability({
      name: "repo.search_text",
      description: "Search policy-allowed repository text.",
      input_schema: SearchTextInput,
      output_schema: z.array(RepositorySearchMatch),
      risk_level: "read",
      side_effect_kind: "filesystem_read",
      requires_approval: false,
      scopes: ["repository:read"],
      execute: (context, input) => searchRepositoryText(workspaceFromContext(context), {
        query: input.query,
        ...(input.relative_path === undefined ? {} : { relative_path: input.relative_path }),
        ...(input.max_results === undefined ? {} : { max_results: input.max_results }),
      }),
    }),
    capability({
      name: "repo.propose_patch",
      description: "Validate and preview a Patch Plan without writing files.",
      input_schema: ProposePatchInput,
      output_schema: PatchPreview,
      risk_level: "read",
      side_effect_kind: "none",
      requires_approval: false,
      scopes: ["repository:read"],
      execute: (context, input) => proposeRepositoryPatch(workspaceFromContext(context), input.patch_plan),
    }),
    capability({
      name: "repo.apply_patch",
      description: "Apply a validated Patch Plan through repository policy.",
      input_schema: ApplyPatchInput,
      output_schema: AppliedPatchResult,
      risk_level: "write",
      side_effect_kind: "repository_mutation",
      requires_approval: true,
      scopes: ["repository:write"],
      execute: (context, input) => applyRepositoryPatch(workspaceFromContext(context), input.patch_plan),
    }),
    capability({
      name: "repo.run_verification",
      description: "Run an allowlisted repository verification command.",
      input_schema: RunVerificationInput,
      output_schema: VerificationReport,
      risk_level: "external_side_effect",
      side_effect_kind: "process_execution",
      requires_approval: true,
      scopes: ["repository:verify"],
      execute: (context, input) => runRepositoryVerificationReport(workspaceFromContext(context), [input.command_id]),
    }),
    capability({
      name: "repo.get_diff",
      description: "Return repository diff and changed files.",
      input_schema: GetDiffInput,
      output_schema: DiffReport,
      risk_level: "read",
      side_effect_kind: "filesystem_read",
      requires_approval: false,
      scopes: ["repository:read"],
      execute: (context, input) => getRepositoryDiffReport(workspaceFromContext(context), input.paths ?? []),
    }),
    capability({
      name: "repo.create_review_report",
      description: "Create a PR-ready repository review report.",
      input_schema: CreateReviewReportInput,
      output_schema: ReviewReport,
      risk_level: "read",
      side_effect_kind: "none",
      requires_approval: false,
      scopes: ["repository:read"],
      execute: (_context, input) => createRepositoryReviewReport({
        goal: input.goal,
        changed_files: input.changed_files,
        diff_summary: input.diff_summary,
        verification_report: VerificationReport.parse({
          results: input.verification_results,
          passed: input.verification_results.every((result) =>
            Boolean(result) && typeof result === "object" && (result as { exit_code?: unknown }).exit_code === 0,
          ),
          summary: "Review report input verification results.",
        }),
      }),
    }),
  ],
};

function capability<Input, Output>(input: {
  readonly name: string;
  readonly description: string;
  readonly input_schema: z.ZodType<Input>;
  readonly output_schema: z.ZodType<Output>;
  readonly risk_level: CapabilityDefinition<Input, Output>["descriptor"]["risk_level"];
  readonly side_effect_kind: CapabilityDefinition<Input, Output>["descriptor"]["side_effect_kind"];
  readonly requires_approval: boolean;
  readonly scopes: readonly string[];
  readonly execute: CapabilityDefinition<Input, Output>["execute"];
}): CapabilityDefinition {
  return {
    descriptor: {
      capability_id: `${PACK_ID}.${input.name}`,
      pack_id: PACK_ID,
      name: input.name,
      description: input.description,
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      risk_level: input.risk_level,
      side_effect_kind: input.side_effect_kind,
      requires_approval: input.requires_approval,
      idempotency_mode: input.risk_level === "read" ? "recommended" : "required",
      timeout_ms: input.name === "repo.run_verification" ? 120_000 : 30_000,
      max_attempts: 1,
      scopes: [...input.scopes],
      tags: ["repository"],
      examples: [],
    },
    input_schema: input.input_schema as z.ZodType<unknown>,
    output_schema: input.output_schema as z.ZodType<unknown>,
    execute: (context, value) => input.execute(context, input.input_schema.parse(value)),
  };
}

function workspaceFromContext(context: PackExecutionContext): RepositoryWorkspaceType {
  return RepositoryWorkspace.parse(context.runtime_config.workspace);
}
