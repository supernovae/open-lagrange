import { generateObject } from "ai";
import { deterministicIdempotencyKey, deterministicPatchPlanId } from "../ids/deterministic-ids.js";
import { createConfiguredLanguageModel } from "../model-providers/index.js";
import { PatchPlan, type PatchPlan as PatchPlanType } from "../schemas/patch-plan.js";
import { ReviewReport, type RepositoryFileRead, type ReviewReport as ReviewReportType, type VerificationReport } from "../schemas/repository.js";

export interface GeneratePatchPlanInput {
  readonly goal: string;
  readonly files: readonly RepositoryFileRead[];
  readonly dry_run: boolean;
}

export async function generatePatchPlan(input: GeneratePatchPlanInput): Promise<PatchPlanType> {
  const model = createConfiguredLanguageModel("coder");
  if (!model) return deterministicPatchPlan(input);
  const { object } = await generateObject({
    model,
    schema: PatchPlan,
    system: [
      "Emit a structured Patch Plan only.",
      "You cannot read files or execute commands.",
      "Use only file excerpts provided in the prompt.",
      "Prefer append_text or small full_replacement patches.",
      "Do not invent command strings or capabilities.",
    ].join("\n"),
    prompt: JSON.stringify(input),
  });
  return PatchPlan.parse(object);
}

export async function generateReviewArtifact(input: {
  readonly goal: string;
  readonly changed_files: readonly string[];
  readonly diff_summary: string;
  readonly verification_report: VerificationReport;
}): Promise<ReviewReportType> {
  const model = createConfiguredLanguageModel("high");
  if (!model) {
    return ReviewReport.parse({
      pr_title: input.goal.slice(0, 72),
      pr_summary: input.diff_summary || `${input.changed_files.length} file(s) changed`,
      test_notes: input.verification_report.results.map((result) => `${result.command}: ${result.exit_code === 0 ? "passed" : "failed"}`),
      risk_notes: input.verification_report.passed ? ["Verification passed."] : ["Verification needs attention."],
      follow_up_notes: [],
    });
  }
  const { object } = await generateObject({
    model,
    schema: ReviewReport,
    system: "Emit a concise repository Review Report only. Do not execute tools.",
    prompt: JSON.stringify(input),
  });
  return ReviewReport.parse(object);
}

function deterministicPatchPlan(input: GeneratePatchPlanInput): PatchPlanType {
  const readme = input.files.find((file) => file.relative_path === "README.md") ?? input.files[0];
  const target = readme?.relative_path ?? "README.md";
  const current = readme?.content ?? "# Repository\n";
  const addition = "\n## Open Lagrange Repository Task Pack\n\nThis repository can be inspected and patched through a policy-gated Open Lagrange Repository Task Pack.\n";
  return PatchPlan.parse({
    patch_plan_id: deterministicPatchPlanId({ goal: input.goal, target }),
    goal: input.goal,
    summary: `Update ${target} for the requested repository task.`,
    files: [{
      relative_path: target,
      operation: readme ? "modify" : "create",
      ...(readme ? { expected_sha256: readme.sha256 } : {}),
      full_replacement: current.includes("Open Lagrange Repository Task Pack") ? current : `${current.trimEnd()}\n${addition}`,
      rationale: "Deterministic fallback creates a small documentation patch.",
    }],
    expected_preconditions: readme ? [`${target} sha256 is ${readme.sha256}`] : [`${target} may be created`],
    risk_level: "write",
    requires_approval: input.dry_run,
    idempotency_key: deterministicIdempotencyKey({ goal: input.goal, target }),
  });
}
