import type { WorkOrder } from "../planning/work-order.js";
import type { VerificationFailure } from "./verification-report.js";
import type { EvidenceBundle } from "./evidence-bundle.js";
import type { PatchPolicy } from "./patch-plan.js";

export interface PatchPlanPromptInput {
  readonly plan_id: string;
  readonly node_id: string;
  readonly work_order: WorkOrder;
  readonly evidence_bundle: EvidenceBundle;
  readonly allowed_files: readonly string[];
  readonly denied_files: readonly string[];
  readonly acceptance_criteria: readonly string[];
  readonly non_goals: readonly string[];
  readonly constraints: readonly string[];
  readonly patch_policy: PatchPolicy;
  readonly latest_failures?: readonly VerificationFailure[];
  readonly current_diff_summary?: string;
  readonly mode: "initial_patch" | "repair";
}

export function patchPlanSystemPrompt(): string {
  return [
    "Emit a PatchPlan JSON object only.",
    "You cannot read files.",
    "You cannot execute commands.",
    "Use only the evidence provided in the prompt.",
    "Do not invent files, symbols, APIs, test results, or command results.",
    "Modify only allowed files.",
    "Denied files are forbidden.",
    "If additional files or commands are needed, request scope expansion instead of patching them.",
    "The safest output is a small targeted patch.",
    "Use anchor-based edits or unified diffs before full replacement.",
    "Use full replacement only when patch policy permits it.",
    "In repair mode, address the latest verification failure with the smallest patch.",
  ].join("\n");
}

export function buildPatchPlanPrompt(input: PatchPlanPromptInput): string {
  return JSON.stringify(redactedPatchPlanContext(input));
}

export function redactedPatchPlanContext(input: PatchPlanPromptInput): Record<string, unknown> {
  return {
    plan_id: input.plan_id,
    node_id: input.node_id,
    mode: input.mode,
    work_order: {
      work_order_id: input.work_order.work_order_id,
      phase: input.work_order.phase,
      objective: input.work_order.objective,
      acceptance_criteria: input.work_order.acceptance_criteria,
      non_goals: input.work_order.non_goals,
      constraints: input.work_order.constraints,
      latest_failures: input.work_order.latest_failures,
    },
    evidence_bundle: {
      evidence_bundle_id: input.evidence_bundle.evidence_bundle_id,
      artifact_id: input.evidence_bundle.artifact_id,
      files: input.evidence_bundle.files.map((file) => ({
        path: file.path,
        sha256: file.sha256,
        excerpt: redact(file.excerpt),
        reason: file.reason,
        line_start: file.line_start,
        line_end: file.line_end,
      })),
      findings: input.evidence_bundle.findings,
      notes: input.evidence_bundle.notes,
    },
    acceptance_criteria: input.acceptance_criteria,
    non_goals: input.non_goals,
    constraints: input.constraints,
    allowed_files: input.allowed_files,
    denied_files: input.denied_files,
    patch_policy: input.patch_policy,
    latest_failures: input.latest_failures?.map((failure) => ({
      command_id: failure.command_id,
      summary: redact(failure.summary),
      stderr_preview: redact(failure.stderr_preview).slice(0, 2_000),
    })) ?? [],
    current_diff_summary: input.current_diff_summary ? redact(input.current_diff_summary).slice(0, 4_000) : undefined,
  };
}

function redact(value: string): string {
  return value
    .replace(/([A-Z0-9_]*SECRET[A-Z0-9_]*|[A-Z0-9_]*TOKEN[A-Z0-9_]*|[A-Z0-9_]*KEY[A-Z0-9_]*)=([^\s]+)/gi, "$1=[redacted]")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[redacted]");
}
