import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ModelRouteConfig } from "../evals/model-route-config.js";
import { ModelRoleCallError, type ModelRoleTraceContext } from "../models/model-route-executor.js";
import { stableHash } from "../util/hash.js";
import { composePlanfileFromIntent, type RuntimeProfileForComposition } from "./intent-to-plan-composer.js";
import { renderPlanfileMarkdown } from "./planfile-markdown.js";
import { PlanBuilderSession, savePlanBuilderSession } from "./plan-builder-session.js";
import { unansweredQuestions } from "./plan-builder-question.js";
import { PlanRevision, revisePlanfileWithModel } from "./plan-revision.js";
import { simulatePlanfile } from "./plan-simulation.js";
import { Planfile, type Planfile as PlanfileType } from "./planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "./planfile-validator.js";

export interface PlanBuilderConfig {
  readonly max_revisions?: number;
  readonly max_questions?: number;
  readonly max_model_calls?: number;
  readonly allow_assumptions?: boolean;
  readonly require_confirmation_for_side_effects?: boolean;
}

export interface ComposeInitialPlanInput {
  readonly prompt?: string;
  readonly skills_markdown?: string;
  readonly prompt_source?: "chat" | "skills_file" | "planfile" | "template";
  readonly runtime_profile?: RuntimeProfileForComposition;
  readonly context?: { readonly repo_path?: string; readonly provider_preference?: string; readonly schedule_preference?: unknown };
  readonly config?: PlanBuilderConfig;
  readonly now?: string;
  readonly persist?: boolean;
}

export async function composeInitialPlan(input: ComposeInitialPlanInput): Promise<PlanBuilderSession> {
  const now = input.now ?? new Date().toISOString();
  const originalInput = input.skills_markdown ?? input.prompt ?? "";
  const prompt = input.prompt ?? skillPrompt(input.skills_markdown ?? "");
  const sessionId = `builder_${stableHash({ prompt, source: input.prompt_source ?? (input.skills_markdown ? "skills_file" : "chat") }).slice(0, 18)}`;
  const composed = await composePlanfileFromIntent({
    prompt,
    ...(input.runtime_profile ? { runtime_profile: input.runtime_profile } : {}),
    mode: "dry_run",
    ...(input.context ? { context: input.context } : {}),
    now,
  });
  const planfile = lifecyclePlanfile(composed.planfile, sessionId, now, "unknown", "unknown", 0);
  const validation = validatePlanfile(planfile);
  const simulation = simulatePlanfile({
    planfile,
    validation_report: validation,
    ...(input.runtime_profile ? { runtime_profile: input.runtime_profile } : {}),
    ...(input.config?.max_questions === undefined ? {} : { max_questions: input.config.max_questions }),
  });
  const pending = unansweredQuestions(simulation.questions);
  const status = validation.ok && simulation.status === "ready" ? "ready" : pending.some((question) => question.severity === "blocking") ? "needs_input" : simulation.status === "invalid" ? "yielded" : "needs_input";
  const session = PlanBuilderSession.parse({
    session_id: sessionId,
    prompt_source: input.prompt_source ?? (input.skills_markdown ? "skills_file" : "chat"),
    original_input: originalInput || prompt,
    current_intent_frame: composed.intent_frame,
    current_planfile: lifecyclePlanfile(planfile, sessionId, now, validation.ok ? "passed" : "failed", simulation.status, 0, status === "ready" ? "ready" : "draft"),
    simulation_report: simulation,
    validation_report: validation,
    pending_questions: pending,
    answered_questions: [],
    revision_history: [],
    planfile_revision_history: [],
    status,
    ...(status === "yielded" ? { yield_reason: "Planfile validation failed and requires semantic revision." } : {}),
    created_at: now,
    updated_at: now,
  });
  return input.persist === false ? session : savePlanBuilderSession(session);
}

export function simulatePlan(session: PlanBuilderSession, options: { readonly runtime_profile?: RuntimeProfileForComposition; readonly config?: PlanBuilderConfig; readonly persist?: boolean } = {}): PlanBuilderSession {
  if (!session.current_planfile) return updateSession(session, { status: "yielded", yield_reason: "No Planfile is available to simulate." }, options.persist);
  const simulation = simulatePlanfile({
    planfile: session.current_planfile,
    ...(session.validation_report ? { validation_report: session.validation_report } : {}),
    ...(options.runtime_profile ? { runtime_profile: options.runtime_profile } : {}),
    ...(options.config?.max_questions === undefined ? {} : { max_questions: options.config.max_questions }),
  });
  return updateSession(session, {
    simulation_report: simulation,
    pending_questions: mergeQuestions(session.pending_questions, simulation.questions),
    status: simulation.status === "ready" ? "validating" : simulation.status === "needs_input" || simulation.status === "missing_requirements" ? "needs_input" : "yielded",
  }, options.persist);
}

export function validatePlan(session: PlanBuilderSession, options: { readonly persist?: boolean } = {}): PlanBuilderSession {
  if (!session.current_planfile) return updateSession(session, { status: "yielded", yield_reason: "No Planfile is available to validate." }, options.persist);
  const validation = validatePlanfile(session.current_planfile);
  const status = validation.ok && session.simulation_report?.status === "ready"
    ? "ready"
    : session.pending_questions.length > 0
      ? "needs_input"
      : validation.ok
        ? "ready"
        : "yielded";
  return updateSession(session, {
    validation_report: validation,
    current_planfile: lifecyclePlanfile(session.current_planfile, session.session_id, new Date().toISOString(), validation.ok ? "passed" : "failed", session.simulation_report?.status ?? "unknown", session.answered_questions.length, status === "ready" ? "ready" : "draft"),
    status,
    ...(status === "yielded" ? { yield_reason: "Planfile validation failed and requires semantic revision." } : {}),
  }, options.persist);
}

export async function revisePlan(session: PlanBuilderSession, options: {
  readonly reason?: string;
  readonly route?: ModelRouteConfig;
  readonly planner?: (input: { readonly planfile: PlanfileType; readonly reason: string }) => Promise<PlanRevision>;
  readonly trace_context?: ModelRoleTraceContext;
  readonly config?: PlanBuilderConfig;
  readonly persist?: boolean;
} = {}): Promise<PlanBuilderSession> {
  if (!session.current_planfile) return updateSession(session, { status: "yielded", yield_reason: "No Planfile is available to revise." }, options.persist);
  const now = new Date().toISOString();
  const deterministic = options.planner ? undefined : deterministicRepair(session, now);
  if (deterministic) return validatePlan(updateSession(session, {
    current_planfile: deterministic.planfile,
    revision_history: [...session.revision_history, deterministic],
    status: "validating",
  }, false), persistOption(options.persist));
  if (!options.route) {
    if (!options.planner) return updateSession(session, { status: "yielded", yield_reason: "MODEL_PROVIDER_UNAVAILABLE: semantic revision requires a configured planner route." }, options.persist);
  }
  if (modelRevisionCount(session) >= (options.config?.max_model_calls ?? 1)) {
    return updateSession(session, { status: "yielded", yield_reason: "Maximum model revision calls reached." }, options.persist);
  }
  try {
    const reason = options.reason ?? session.yield_reason ?? "Semantic Planfile revision requested.";
    const revision = options.planner
      ? await options.planner({ planfile: session.current_planfile, reason })
      : await revisePlanfileWithModel({
        planfile: session.current_planfile,
        reason,
        route: options.route as ModelRouteConfig,
        ...(options.trace_context ? { trace_context: options.trace_context } : {}),
        now,
      });
    return validatePlan(updateSession(session, {
      current_planfile: lifecyclePlanfile(revision.planfile, session.session_id, now, revision.validation_ok ? "passed" : "failed", session.simulation_report?.status ?? "unknown", session.answered_questions.length),
      revision_history: [...session.revision_history, revision],
      status: "validating",
    }, false), persistOption(options.persist));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return updateSession(session, { status: "yielded", yield_reason: message }, options.persist);
  }
}

export function answerQuestion(session: PlanBuilderSession, question_id: string, answer: string, options: { readonly persist?: boolean } = {}): PlanBuilderSession {
  const now = new Date().toISOString();
  const target = session.pending_questions.find((question) => question.question_id === question_id);
  if (!target) return updateSession(session, { status: "yielded", yield_reason: `Question not found: ${question_id}` }, options.persist);
  const answered = { ...target, answer, answered_at: now };
  const pending = session.pending_questions.filter((question) => question.question_id !== question_id);
  const planfile = applyQuestionAnswer(session.current_planfile, target, answer, session.session_id, now, session.answered_questions.length + 1);
  return updateSession(session, {
    current_planfile: planfile,
    pending_questions: pending,
    answered_questions: [...session.answered_questions, answered],
    status: pending.some((question) => question.severity === "blocking") ? "needs_input" : "validating",
  }, options.persist);
}

export function acceptDefaultAnswers(session: PlanBuilderSession, options: { readonly persist?: boolean } = {}): PlanBuilderSession {
  return session.pending_questions.reduce((next, question) => answerQuestion(next, question.question_id, question.default_assumption ?? question.choices[0] ?? "accepted", { persist: false }), session);
}

export async function stabilizePlan(session: PlanBuilderSession, options: {
  readonly runtime_profile?: RuntimeProfileForComposition;
  readonly route?: ModelRouteConfig;
  readonly config?: PlanBuilderConfig;
  readonly persist?: boolean;
} = {}): Promise<PlanBuilderSession> {
  let next = session;
  const max = options.config?.max_revisions ?? 3;
  for (let index = 0; index < max; index += 1) {
    next = simulatePlan(next, { ...(options.runtime_profile ? { runtime_profile: options.runtime_profile } : {}), ...(options.config ? { config: options.config } : {}), persist: false });
    next = validatePlan(next, { persist: false });
    if (next.status === "ready" || next.status === "needs_input") break;
    next = await revisePlan(next, { ...(options.route ? { route: options.route } : {}), ...(options.config ? { config: options.config } : {}), persist: false });
    if (next.status === "ready" || next.status === "needs_input") break;
  }
  if (next.status !== "ready" && next.status !== "needs_input") {
    next = updateSession(next, { status: "yielded", yield_reason: next.yield_reason ?? "Plan Builder did not stabilize within revision limits." }, false);
  }
  return options.persist === false ? next : savePlanBuilderSession(next);
}

export function saveReadyPlanfile(session: PlanBuilderSession, outputPath: string): { readonly session_id: string; readonly plan_id: string; readonly path: string } {
  if (!session.current_planfile) throw new Error("No Planfile is available to save.");
  if (session.status !== "ready" && session.status !== "approved") throw new Error("Plan Builder session is not ready.");
  const markdown = renderPlanfileMarkdown(session.current_planfile);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown, "utf8");
  return { session_id: session.session_id, plan_id: session.current_planfile.plan_id, path: outputPath };
}

function deterministicRepair(session: PlanBuilderSession, now: string): PlanRevision | undefined {
  if (!session.current_planfile) return undefined;
  const validation = validatePlanfile(session.current_planfile);
  if (!validation.ok) return undefined;
  const planfile = lifecyclePlanfile(session.current_planfile, session.session_id, now, "passed", session.simulation_report?.status ?? "unknown", session.answered_questions.length, session.simulation_report?.status === "ready" ? "ready" : "draft");
  return PlanRevision.parse({
    revision_id: `revision_${stableHash({ plan_id: planfile.plan_id, now, source: "deterministic" }).slice(0, 18)}`,
    source: "deterministic",
    reason: "Updated Planfile lifecycle metadata.",
    changes: ["Updated lifecycle metadata", "Refreshed canonical digest"],
    planfile,
    validation_ok: true,
    created_at: now,
  });
}

function applyQuestionAnswer(planfile: PlanfileType | undefined, question: PlanBuilderSession["pending_questions"][number], answer: string, sessionId: string, now: string, answeredCount: number): PlanfileType | undefined {
  if (!planfile) return undefined;
  const context = { ...(planfile.execution_context ?? {}) };
  if (question.question.toLowerCase().includes("time of day")) {
    const schedule = (context.schedule_intent && typeof context.schedule_intent === "object" ? context.schedule_intent : {}) as Record<string, unknown>;
    context.schedule_intent = { ...schedule, time_of_day: answer };
  }
  context.builder_answers = [...(Array.isArray(context.builder_answers) ? context.builder_answers : []), { question_id: question.question_id, answer, answered_at: now }];
  return lifecyclePlanfile(Planfile.parse({ ...planfile, execution_context: context, updated_at: now }), sessionId, now, "unknown", "unknown", answeredCount);
}

function lifecyclePlanfile(planfile: PlanfileType, sessionId: string, now: string, validationStatus: "unknown" | "passed" | "failed", simulationStatus: "unknown" | "ready" | "needs_input" | "missing_requirements" | "invalid" | "unsafe", answeredCount: number, status: PlanfileType["status"] = planfile.status): PlanfileType {
  return withCanonicalPlanDigest(Planfile.parse({
    ...planfile,
    status,
    lifecycle: {
      ...(planfile.lifecycle ?? {}),
      builder_session_id: sessionId,
      questions_answered: answeredCount,
      assumptions: planfile.goal_frame.assumptions,
      validation_status: validationStatus,
      simulation_status: simulationStatus,
    },
    updated_at: now,
  }));
}

function updateSession(session: PlanBuilderSession, patch: Partial<PlanBuilderSession>, persist = true): PlanBuilderSession {
  const next = PlanBuilderSession.parse({ ...session, ...patch, updated_at: new Date().toISOString() });
  return persist === false ? next : savePlanBuilderSession(next);
}

function mergeQuestions(current: readonly PlanBuilderSession["pending_questions"][number][], next: readonly PlanBuilderSession["pending_questions"][number][]): PlanBuilderSession["pending_questions"] {
  const byId = new Map(current.map((question) => [question.question_id, question]));
  for (const question of next) if (!byId.has(question.question_id)) byId.set(question.question_id, question);
  return [...byId.values()];
}

function modelRevisionCount(session: PlanBuilderSession): number {
  return session.revision_history.filter((revision) => revision.source === "model").length;
}

function persistOption(value: boolean | undefined): { readonly persist?: boolean } {
  return value === undefined ? {} : { persist: value };
}

function skillPrompt(markdown: string): string {
  return `Create a Planfile from this skills.md workflow:\n\n${markdown}`;
}
