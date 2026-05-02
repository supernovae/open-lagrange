import { listModelRouteConfigs } from "@open-lagrange/core/evals";
import { acceptDefaultAnswers, answerQuestion, applyPlanfile, composeInitialPlan, createScheduleRecord, getPlanBuilderSession, revisePlan, saveReadyPlanfile, simulatePlan, stabilizePlan, validatePlan } from "@open-lagrange/core/planning";
import { z } from "zod";

export const StartSessionPayload = z.object({
  prompt: z.string().min(1).optional(),
  skills_markdown: z.string().min(1).optional(),
  repo_path: z.string().min(1).optional(),
  provider_id: z.string().min(1).optional(),
}).strict().refine((value) => Boolean(value.prompt ?? value.skills_markdown), "prompt or skills_markdown is required");

export const AnswerPayload = z.object({
  question_id: z.string().min(1),
  answer: z.string().min(1),
}).strict();

export const RevisePayload = z.object({
  prompt: z.string().min(1).optional(),
  model_route: z.string().min(1).optional(),
}).strict();

export const SavePayload = z.object({
  output_path: z.string().min(1),
}).strict();

export const RunPayload = z.object({
  live: z.boolean().default(false),
}).strict();

export const SchedulePayload = z.object({
  cadence: z.enum(["daily", "weekly", "cron"]).default("daily"),
  time_of_day: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
}).strict();

export async function startPlanBuilderSession(raw: unknown): Promise<unknown> {
  const payload = StartSessionPayload.parse(raw);
  return composeInitialPlan({
    ...(payload.skills_markdown ? { skills_markdown: payload.skills_markdown, prompt_source: "skills_file" } : { prompt: payload.prompt ?? "" }),
    context: {
      ...(payload.repo_path ? { repo_path: payload.repo_path } : {}),
      ...(payload.provider_id ? { provider_preference: payload.provider_id } : {}),
    },
  });
}

export function readPlanBuilderSession(sessionId: string): unknown {
  return getPlanBuilderSession(sessionId) ?? { status: "missing", session_id: sessionId };
}

export function answerPlanBuilderQuestion(sessionId: string, raw: unknown): unknown {
  const payload = AnswerPayload.parse(raw);
  return answerQuestion(requireSession(sessionId), payload.question_id, payload.answer);
}

export async function acceptPlanBuilderDefaults(sessionId: string): Promise<unknown> {
  return stabilizePlan(acceptDefaultAnswers(requireSession(sessionId), { persist: false }));
}

export async function revisePlanBuilderSession(sessionId: string, raw: unknown): Promise<unknown> {
  const payload = RevisePayload.parse(raw);
  const route = payload.model_route ? modelRouteById(payload.model_route) : undefined;
  const revised = await revisePlan(requireSession(sessionId), { ...(payload.prompt ? { reason: payload.prompt } : {}), ...(route ? { route } : {}), persist: false });
  return stabilizePlan(revised, { ...(route ? { route } : {}) });
}

export function validatePlanBuilderSession(sessionId: string): unknown {
  return validatePlan(simulatePlan(requireSession(sessionId)));
}

export function savePlanBuilderPlanfile(sessionId: string, raw: unknown): unknown {
  const payload = SavePayload.parse(raw);
  return saveReadyPlanfile(requireSession(sessionId), payload.output_path);
}

export async function runPlanBuilderPlanfile(sessionId: string, raw: unknown): Promise<unknown> {
  const payload = RunPayload.parse(raw);
  const session = requireReadySession(sessionId);
  return applyPlanfile({ planfile: session.current_planfile, live: payload.live });
}

export function schedulePlanBuilderPlanfile(sessionId: string, raw: unknown): unknown {
  const payload = SchedulePayload.parse(raw);
  const session = requireReadySession(sessionId);
  const path = `.open-lagrange/plans/${session.current_planfile.plan_id}.plan.md`;
  saveReadyPlanfile(session, path);
  return createScheduleRecord({
    planfile: session.current_planfile,
    planfile_path: path,
    cadence: payload.cadence,
    ...(payload.time_of_day ? { time_of_day: payload.time_of_day } : {}),
    ...(payload.timezone ? { timezone: payload.timezone } : {}),
  });
}

function requireSession(sessionId: string) {
  const session = getPlanBuilderSession(sessionId);
  if (!session) throw new Error(`Plan Builder session not found: ${sessionId}`);
  return session;
}

function requireReadySession(sessionId: string) {
  const session = requireSession(sessionId);
  if (!session.current_planfile || (session.status !== "ready" && session.status !== "approved")) throw new Error(`Plan Builder session is not ready: ${sessionId}`);
  return { ...session, current_planfile: session.current_planfile };
}

function modelRouteById(routeId: string) {
  const route = listModelRouteConfigs().find((item) => item.route_id === routeId);
  if (!route) throw new Error(`Unknown model route: ${routeId}`);
  return route;
}
