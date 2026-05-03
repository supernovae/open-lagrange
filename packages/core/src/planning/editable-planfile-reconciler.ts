import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { createCapabilitySnapshotForTask } from "../capability-registry/registry.js";
import type { StructuredError as StructuredErrorType } from "../schemas/open-cot.js";
import { stableHash } from "../util/hash.js";
import { createLocalPlanArtifactStore } from "./local-plan-artifacts.js";
import { renderPlanMermaid } from "./mermaid-renderer.js";
import { getPlanBuilderSession, PlanBuilderSession, savePlanBuilderSession } from "./plan-builder-session.js";
import type { PlannerQuestion } from "./plan-builder-question.js";
import { simulatePlanfile } from "./plan-simulation.js";
import { diffPlanfiles, hasStructuredDiffChanges, type PlanfileStructuredDiff } from "./planfile-diff.js";
import { canonicalPlanSha256 } from "./planfile-canonicalize.js";
import { PlanfileEditError } from "./planfile-edit-errors.js";
import type { RuntimeProfileForRequirements } from "./plan-requirements.js";
import { PlanfileRevision, PlanfileUpdateReport, type PlanfileUpdateReport as PlanfileUpdateReportType } from "./planfile-update-report.js";
import { renderPlanfileMarkdown } from "./planfile-markdown.js";
import { parsePlanfileMarkdown, parsePlanfileYaml } from "./planfile-parser.js";
import { Planfile, type Planfile as PlanfileType } from "./planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "./planfile-validator.js";

export const UpdateBuilderPlanfileFromMarkdownInput = z.object({
  session_id: z.string().min(1),
  markdown: z.string().min(1),
  update_source: z.enum(["web", "tui", "cli", "external_file"]),
  actor: z.object({
    principal_id: z.string().min(1).optional(),
    display_name: z.string().min(1).optional(),
  }).strict().optional(),
  runtime_profile: z.custom<RuntimeProfileForRequirements>().optional(),
  options: z.object({
    allow_risk_increase: z.boolean().optional(),
    allow_new_capabilities: z.boolean().optional(),
    allow_schedule_change: z.boolean().optional(),
    run_model_revision_if_needed: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export type UpdateBuilderPlanfileFromMarkdownInput = z.infer<typeof UpdateBuilderPlanfileFromMarkdownInput>;

export async function updateBuilderPlanfileFromMarkdown(raw: UpdateBuilderPlanfileFromMarkdownInput): Promise<PlanfileUpdateReportType> {
  const input = UpdateBuilderPlanfileFromMarkdownInput.parse(raw);
  const session = getPlanBuilderSession(input.session_id);
  if (!session) throw new PlanfileEditError("SESSION_NOT_FOUND", `Plan Builder session not found: ${input.session_id}`);
  if (!session.current_planfile) throw new PlanfileEditError("NO_CURRENT_PLANFILE", `Plan Builder session has no current Planfile: ${input.session_id}`);
  return reconcileForSession({
    session,
    markdown: input.markdown,
    update_source: input.update_source,
    ...(input.runtime_profile ? { runtime_profile: input.runtime_profile } : {}),
    ...(input.options ? { options: input.options } : {}),
  });
}

export function reconcilePlanfileMarkdown(input: {
  readonly markdown: string;
  readonly session_id?: string;
  readonly runtime_profile?: RuntimeProfileForRequirements;
}): PlanfileUpdateReportType {
  const sessionId = input.session_id ?? "standalone";
  return reconcileStandalone(input.markdown, sessionId, input.runtime_profile);
}

export function importBuilderPlanfileFromMarkdown(input: {
  readonly markdown: string;
  readonly update_source?: "web" | "tui" | "cli" | "external_file";
  readonly original_input?: string;
  readonly runtime_profile?: RuntimeProfileForRequirements;
}): PlanBuilderSession {
  const now = new Date().toISOString();
  const parsed = withCanonicalPlanDigest(parsePlanfileMarkdown(input.markdown));
  const sessionId = parsed.lifecycle?.builder_session_id ?? `builder_${stableHash({ plan_id: parsed.plan_id, digest: parsed.canonical_plan_digest }).slice(0, 18)}`;
  const validation = validatePlanfile(parsed, { capability_snapshot: createCapabilitySnapshotForTask({ now }) });
  const simulation = simulatePlanfile({ planfile: parsed, validation_report: validation, ...(input.runtime_profile ? { runtime_profile: input.runtime_profile } : {}) });
  const status = validation.ok && simulation.status === "ready" ? "ready" : simulation.status === "needs_input" || simulation.status === "missing_requirements" ? "needs_input" : "yielded";
  const revision = PlanfileRevision.parse({
    revision_id: `planfile_revision_${stableHash({ session_id: sessionId, digest: parsed.canonical_plan_digest, now }).slice(0, 18)}`,
    session_id: sessionId,
    source: input.update_source ?? "external_file",
    new_digest: parsed.canonical_plan_digest,
    status: status === "ready" ? "accepted" : status === "needs_input" ? "needs_input" : "rejected",
    summary: `Imported Planfile ${parsed.plan_id}.`,
    created_at: now,
    artifact_refs: [],
  });
  return savePlanBuilderSession(PlanBuilderSession.parse({
    session_id: sessionId,
    prompt_source: "planfile",
    original_input: input.original_input ?? `Imported Planfile ${parsed.plan_id}`,
    current_planfile: status === "yielded" ? undefined : lifecycle(parsed, sessionId, now, validation.ok ? "passed" : "failed", simulation.status, status === "ready" ? "ready" : "draft"),
    simulation_report: simulation,
    validation_report: validation,
    pending_questions: simulation.questions,
    answered_questions: [],
    revision_history: [],
    planfile_revision_history: [revision],
    status,
    ...(status === "yielded" ? { yield_reason: "Imported Planfile did not validate." } : {}),
    created_at: now,
    updated_at: now,
  }));
}

export function diffPlanfileMarkdown(oldMarkdown: string, newMarkdown: string): {
  readonly previous_plan_digest: string;
  readonly new_plan_digest: string;
  readonly diff: PlanfileStructuredDiff;
  readonly diff_status: "unchanged" | "changed";
} {
  const previous = withCanonicalPlanDigest(parsePlanfileMarkdown(oldMarkdown));
  const next = withCanonicalPlanDigest(parsePlanfileMarkdown(newMarkdown));
  const diff = diffPlanfiles(previous, next);
  return {
    previous_plan_digest: canonicalPlanSha256(previous),
    new_plan_digest: canonicalPlanSha256(next),
    diff,
    diff_status: hasStructuredDiffChanges(diff) ? "changed" : "unchanged",
  };
}

export function diffPlanfileFiles(oldPath: string, newPath: string): ReturnType<typeof diffPlanfileMarkdown> {
  return diffPlanfileMarkdown(readPlanfileFileAsMarkdown(oldPath), readPlanfileFileAsMarkdown(newPath));
}

async function reconcileForSession(input: {
  readonly session: PlanBuilderSession;
  readonly markdown: string;
  readonly update_source: "web" | "tui" | "cli" | "external_file";
  readonly runtime_profile?: RuntimeProfileForRequirements;
  readonly options?: UpdateBuilderPlanfileFromMarkdownInput["options"];
}): Promise<PlanfileUpdateReportType> {
  const now = new Date().toISOString();
  const previous = withCanonicalPlanDigest(input.session.current_planfile as PlanfileType);
  const previousDigest = canonicalPlanSha256(previous);
  let next: PlanfileType | undefined;
  try {
    next = withCanonicalPlanDigest(parsePlanfileMarkdown(input.markdown));
  } catch (caught) {
    const report = baseReport({
      session_id: input.session.session_id,
      previous_digest: previousDigest,
      parse_status: "failed",
      validation_status: "not_run",
      simulation_status: "not_run",
      builder_status: input.session.status,
      errors: [structuredError("INVALID_PLAN", caught instanceof Error ? caught.message : String(caught), now)],
    });
    const withArtifactRefs = await withArtifacts({ session: input.session, report, markdown: input.markdown, source: input.update_source, now, accepted: false });
    const revision = PlanfileRevision.parse({
      revision_id: `planfile_revision_${stableHash({ session_id: input.session.session_id, previousDigest, now, status: "parse_failed" }).slice(0, 18)}`,
      session_id: input.session.session_id,
      source: input.update_source,
      previous_digest: previousDigest,
      status: "rejected",
      summary: "Rejected edited Planfile because parsing failed.",
      created_at: now,
      artifact_refs: withArtifactRefs.artifact_refs,
    });
    savePlanBuilderSession(PlanBuilderSession.parse({
      ...input.session,
      planfile_revision_history: [...(input.session.planfile_revision_history ?? []), revision],
      updated_at: now,
    }));
    return withArtifactRefs;
  }
  const newDigest = canonicalPlanSha256(next);
  const diff = diffPlanfiles(previous, next);
  const validation = validatePlanfile(next, { capability_snapshot: createCapabilitySnapshotForTask({ now }) });
  const safetyErrors = safetyErrorsFor(diff, next, input.options, now);
  const validationErrors = [
    ...validation.issues.filter((issue) => issue.severity === "error").map((issue) => structuredError(issue.code === "UNKNOWN_CAPABILITY" ? "UNKNOWN_CAPABILITY" : issue.code === "APPROVAL_REQUIRED" ? "APPROVAL_REQUIRED" : "INVALID_PLAN", issue.message, now, { path: issue.path })),
    ...safetyErrors,
  ];
  const simulation = validationErrors.length > 0 ? undefined : simulatePlanfile({ planfile: next, validation_report: validation, ...(input.runtime_profile ? { runtime_profile: input.runtime_profile } : {}) });
  const accepted = validationErrors.length === 0 && simulation?.status !== "invalid" && simulation?.status !== "unsafe";
  const builderStatus = accepted
    ? simulation?.status === "ready" ? "ready" : "needs_input"
    : input.session.status;
  const report = PlanfileUpdateReport.parse({
    session_id: input.session.session_id,
    previous_plan_digest: previousDigest,
    new_plan_digest: newDigest,
    parse_status: "passed",
    diff_status: hasStructuredDiffChanges(diff) ? "changed" : "unchanged",
    simulation_status: simulation?.status ?? "not_run",
    validation_status: validation.ok && safetyErrors.length === 0 ? "passed" : "failed",
    builder_status: builderStatus,
    diff,
    questions: simulation?.questions ?? [],
    validation_errors: validationErrors,
    simulation_warnings: simulation?.warnings ?? [],
    regenerated_markdown: renderPlanfileMarkdown(next),
    mermaid: renderPlanMermaid(next),
    artifact_refs: [],
  });
  const withArtifactRefs = await withArtifacts({ session: input.session, report, markdown: input.markdown, source: input.update_source, now, accepted });
  const revision = PlanfileRevision.parse({
    revision_id: `planfile_revision_${stableHash({ session_id: input.session.session_id, previousDigest, newDigest, now }).slice(0, 18)}`,
    session_id: input.session.session_id,
    source: input.update_source,
    previous_digest: previousDigest,
    new_digest: newDigest,
    status: accepted ? builderStatus === "needs_input" ? "needs_input" : "accepted" : "rejected",
    summary: accepted ? `Accepted edited Planfile ${next.plan_id}.` : `Rejected edited Planfile ${next.plan_id}.`,
    created_at: now,
    artifact_refs: withArtifactRefs.artifact_refs,
  });
  const nextHistory = [...(input.session.planfile_revision_history ?? []), revision];
  if (accepted && simulation) {
    savePlanBuilderSession(PlanBuilderSession.parse({
      ...input.session,
      current_planfile: lifecycle(next, input.session.session_id, now, validation.ok ? "passed" : "failed", simulation.status, builderStatus === "ready" ? "ready" : "draft"),
      validation_report: validation,
      simulation_report: simulation,
      pending_questions: simulation.questions,
      status: builderStatus,
      planfile_revision_history: nextHistory,
      updated_at: now,
    }));
  } else {
    savePlanBuilderSession(PlanBuilderSession.parse({
      ...input.session,
      planfile_revision_history: nextHistory,
      updated_at: now,
    }));
  }
  return withArtifactRefs;
}

function reconcileStandalone(markdown: string, sessionId: string, runtimeProfile?: RuntimeProfileForRequirements): PlanfileUpdateReportType {
  const now = new Date().toISOString();
  try {
    const planfile = withCanonicalPlanDigest(parsePlanfileMarkdown(markdown));
    const validation = validatePlanfile(planfile, { capability_snapshot: createCapabilitySnapshotForTask({ now }) });
    const simulation = simulatePlanfile({ planfile, validation_report: validation, ...(runtimeProfile ? { runtime_profile: runtimeProfile } : {}) });
    return PlanfileUpdateReport.parse({
      session_id: sessionId,
      new_plan_digest: canonicalPlanSha256(planfile),
      parse_status: "passed",
      diff_status: "not_available",
      simulation_status: simulation.status,
      validation_status: validation.ok ? "passed" : "failed",
      builder_status: validation.ok && simulation.status === "ready" ? "ready" : simulation.status === "needs_input" || simulation.status === "missing_requirements" ? "needs_input" : "yielded",
      questions: simulation.questions,
      validation_errors: validation.issues.filter((issue) => issue.severity === "error").map((issue) => structuredError(issue.code === "UNKNOWN_CAPABILITY" ? "UNKNOWN_CAPABILITY" : "INVALID_PLAN", issue.message, now, { path: issue.path })),
      simulation_warnings: simulation.warnings,
      regenerated_markdown: renderPlanfileMarkdown(planfile),
      mermaid: renderPlanMermaid(planfile),
      artifact_refs: [],
    });
  } catch (caught) {
    return baseReport({
      session_id: sessionId,
      parse_status: "failed",
      validation_status: "not_run",
      simulation_status: "not_run",
      builder_status: "yielded",
      errors: [structuredError("INVALID_PLAN", caught instanceof Error ? caught.message : String(caught), now)],
    });
  }
}

function safetyErrorsFor(diff: PlanfileStructuredDiff, next: PlanfileType, options: UpdateBuilderPlanfileFromMarkdownInput["options"] | undefined, now: string): StructuredErrorType[] {
  const errors: StructuredErrorType[] = [];
  if (diff.capabilities_added.length > 0 && options?.allow_new_capabilities !== true) {
    errors.push(structuredError("APPROVAL_REQUIRED", `New capabilities require confirmation: ${diff.capabilities_added.join(", ")}`, now));
  }
  const increased = diff.risk_changes.filter((change) => change.increased);
  if (increased.length > 0 && options?.allow_risk_increase !== true) {
    errors.push(structuredError("APPROVAL_REQUIRED", `Risk increases require confirmation: ${increased.map((change) => `${change.target} ${change.before}->${change.after}`).join(", ")}`, now));
  }
  if (diff.schedule_changed && options?.allow_schedule_change !== true) {
    errors.push(structuredError("APPROVAL_REQUIRED", "Schedule changes require confirmation.", now));
  }
  if (next.nodes.some((node) => node.risk_level === "external_side_effect" && !node.approval_required)) {
    errors.push(structuredError("APPROVAL_REQUIRED", "New external side effects require approval.", now));
  }
  return errors;
}

async function withArtifacts(input: {
  readonly session: PlanBuilderSession;
  readonly report: PlanfileUpdateReportType;
  readonly markdown: string;
  readonly source: "web" | "tui" | "cli" | "external_file";
  readonly now: string;
  readonly accepted: boolean;
}): Promise<PlanfileUpdateReportType> {
  const store = createLocalPlanArtifactStore({ plan_id: input.session.current_planfile?.plan_id ?? input.session.session_id, output_dir: `.open-lagrange/plan-builder/${input.session.session_id}/edits/${safeSegment(input.now)}`, now: input.now });
  const base = { source_mode: "live", execution_mode: "live", live: true, metadata: { edit_source: input.source, accepted: input.accepted }, lineage: { produced_by_plan_id: input.session.current_planfile?.plan_id, input_artifact_refs: [input.session.session_id] } };
  const artifacts = [
    artifact("edited_planfile_snapshot", "Edited Planfile Snapshot", "User-submitted Planfile Markdown.", input.markdown, "text/markdown", base),
    artifact("planfile_update_report", "Planfile Update Report", "Planfile reconciliation report.", input.report, "application/json", base),
    ...(input.report.diff ? [artifact("planfile_diff", "Planfile Diff", "Structured Planfile diff.", input.report.diff, "application/json", base)] : []),
    ...(input.report.regenerated_markdown ? [artifact("regenerated_planfile", "Regenerated Planfile", "Regenerated Planfile Markdown projection.", input.report.regenerated_markdown, "text/markdown", base)] : []),
    artifact("validation_report", "Validation Report", "Validation status for the edited Planfile.", { status: input.report.validation_status, errors: input.report.validation_errors }, "application/json", base),
    artifact("simulation_report", "Simulation Report", "Simulation status for the edited Planfile.", { status: input.report.simulation_status, warnings: input.report.simulation_warnings, questions: input.report.questions }, "application/json", base),
  ];
  for (const item of artifacts) await store.recordArtifact(item);
  const artifactRefs = store.flush().map((summary) => summary.artifact_id);
  return PlanfileUpdateReport.parse({ ...input.report, artifact_refs: artifactRefs });
}

function artifact(kind: string, title: string, summary: string, content: unknown, contentType: string, base: Record<string, unknown>): Record<string, unknown> {
  return {
    artifact_id: `${kind}_${stableHash({ title, content }).slice(0, 16)}`,
    kind,
    title,
    summary,
    content,
    content_type: contentType,
    validation_status: "not_applicable",
    ...base,
  };
}

function baseReport(input: {
  readonly session_id: string;
  readonly previous_digest?: string;
  readonly parse_status: "passed" | "failed";
  readonly validation_status: "not_run" | "passed" | "failed";
  readonly simulation_status: "not_run";
  readonly builder_status: PlanfileUpdateReportType["builder_status"];
  readonly errors: readonly StructuredErrorType[];
}): PlanfileUpdateReportType {
  return PlanfileUpdateReport.parse({
    session_id: input.session_id,
    ...(input.previous_digest ? { previous_plan_digest: input.previous_digest } : {}),
    parse_status: input.parse_status,
    diff_status: "not_available",
    simulation_status: input.simulation_status,
    validation_status: input.validation_status,
    builder_status: input.builder_status,
    questions: [],
    validation_errors: [...input.errors],
    simulation_warnings: [],
    artifact_refs: [],
  });
}

function lifecycle(planfile: PlanfileType, sessionId: string, now: string, validationStatus: "unknown" | "passed" | "failed", simulationStatus: "unknown" | "ready" | "needs_input" | "missing_requirements" | "invalid" | "unsafe", status: PlanfileType["status"]): PlanfileType {
  return withCanonicalPlanDigest(Planfile.parse({
    ...planfile,
    status,
    lifecycle: {
      ...(planfile.lifecycle ?? {}),
      builder_session_id: sessionId,
      assumptions: planfile.goal_frame.assumptions,
      validation_status: validationStatus,
      simulation_status: simulationStatus,
    },
    updated_at: now,
  }));
}

function structuredError(code: StructuredErrorType["code"], message: string, now: string, details?: Record<string, unknown>): StructuredErrorType {
  return {
    code,
    message,
    observed_at: now,
    ...(details ? { details } : {}),
  };
}

function safeSegment(value: string): string {
  return basename(value.replace(/[^a-zA-Z0-9_.-]+/g, "_"));
}

function readPlanfileFileAsMarkdown(path: string): string {
  const text = readFileSync(path, "utf8");
  return path.endsWith(".yaml") || path.endsWith(".yml") ? renderPlanfileMarkdown(withCanonicalPlanDigest(parsePlanfileYaml(text))) : text;
}
