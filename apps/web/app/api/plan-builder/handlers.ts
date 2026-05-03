import { listModelRouteConfigs } from "@open-lagrange/core/evals";
import { acceptDefaultAnswers, answerQuestion, applyPlanfile, composeInitialPlan, createScheduleRecord, diffPlanfileMarkdown, getPlanBuilderSession, importBuilderPlanfileFromMarkdown, reconcilePlanfileMarkdown, renderPlanfileMarkdown, revisePlan, saveReadyPlanfile, simulatePlan, stabilizePlan, updateBuilderPlanfileFromMarkdown, validatePlan, type RuntimeProfileForComposition } from "@open-lagrange/core/planning";
import { getCurrentProfile } from "@open-lagrange/runtime-manager";
import { z } from "zod";
import { HttpError } from "../http";

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

export const UpdatePlanfilePayload = z.object({
  markdown: z.string().min(1),
  allow_risk_increase: z.boolean().default(false),
  allow_new_capabilities: z.boolean().default(false),
  allow_schedule_change: z.boolean().default(false),
}).strict();

export const ImportPlanfilePayload = z.object({
  markdown: z.string().min(1),
}).strict();

export const ReconcilePayload = z.object({
  markdown: z.string().min(1),
}).strict();

export const DiffPayload = z.object({
  old_markdown: z.string().min(1),
  new_markdown: z.string().min(1),
}).strict();

export async function startPlanBuilderSession(raw: unknown): Promise<unknown> {
  const payload = StartSessionPayload.parse(raw);
  return sessionResponse(await composeInitialPlan({
    ...(payload.skills_markdown ? { skills_markdown: payload.skills_markdown, prompt_source: "skills_file" } : { prompt: payload.prompt ?? "" }),
    runtime_profile: await planningRuntimeProfile(),
    context: {
      ...(payload.repo_path ? { repo_path: payload.repo_path } : {}),
      ...(payload.provider_id ? { provider_preference: payload.provider_id } : {}),
    },
  }));
}

export function readPlanBuilderSession(sessionId: string): unknown {
  const session = getPlanBuilderSession(sessionId);
  return session ? sessionResponse(session) : { status: "missing", session_id: sessionId };
}

export async function answerPlanBuilderQuestion(sessionId: string, raw: unknown): Promise<unknown> {
  const payload = AnswerPayload.parse(raw);
  const answered = answerQuestion(requireSession(sessionId), payload.question_id, payload.answer, { persist: false });
  return sessionResponse(await stabilizePlan(answered, { runtime_profile: await planningRuntimeProfile() }));
}

export async function acceptPlanBuilderDefaults(sessionId: string): Promise<unknown> {
  return sessionResponse(await stabilizePlan(acceptDefaultAnswers(requireSession(sessionId), { persist: false }), { runtime_profile: await planningRuntimeProfile() }));
}

export async function revisePlanBuilderSession(sessionId: string, raw: unknown): Promise<unknown> {
  const payload = RevisePayload.parse(raw);
  const route = payload.model_route ? modelRouteById(payload.model_route) : undefined;
  const revised = await revisePlan(requireSession(sessionId), { ...(payload.prompt ? { reason: payload.prompt } : {}), ...(route ? { route } : {}), persist: false });
  return sessionResponse(await stabilizePlan(revised, { runtime_profile: await planningRuntimeProfile(), ...(route ? { route } : {}) }));
}

export async function validatePlanBuilderSession(sessionId: string): Promise<unknown> {
  return sessionResponse(validatePlan(simulatePlan(requireSession(sessionId), { runtime_profile: await planningRuntimeProfile() })));
}

export function savePlanBuilderPlanfile(sessionId: string, raw: unknown): unknown {
  const payload = SavePayload.parse(raw);
  const session = requireSession(sessionId);
  if (!session.current_planfile || (session.status !== "ready" && session.status !== "approved")) {
    throw new HttpError(409, {
      error: "SESSION_NOT_READY",
      session_id: sessionId,
      status: session.status,
      pending_questions: session.pending_questions,
      missing_providers: session.simulation_report?.warnings.filter((warning) => warning.startsWith("Missing required provider")) ?? [],
      message: "Answer blocking questions or validate the Plan Builder session before saving.",
    });
  }
  return saveReadyPlanfile(session, payload.output_path);
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

export async function updatePlanBuilderPlanfile(sessionId: string, raw: unknown): Promise<unknown> {
  const payload = UpdatePlanfilePayload.parse(raw);
  return updateBuilderPlanfileFromMarkdown({
    session_id: sessionId,
    markdown: payload.markdown,
    update_source: "web",
    runtime_profile: await planningRuntimeProfile(),
    options: {
      allow_risk_increase: payload.allow_risk_increase,
      allow_new_capabilities: payload.allow_new_capabilities,
      allow_schedule_change: payload.allow_schedule_change,
    },
  });
}

export async function importPlanBuilderPlanfile(_sessionId: string, raw: unknown): Promise<unknown> {
  const payload = ImportPlanfilePayload.parse(raw);
  return importBuilderPlanfileFromMarkdown({ markdown: payload.markdown, update_source: "web", runtime_profile: await planningRuntimeProfile() });
}

export async function reconcilePlanBuilderPlanfile(raw: unknown): Promise<unknown> {
  const payload = ReconcilePayload.parse(raw);
  return reconcilePlanfileMarkdown({ markdown: payload.markdown, runtime_profile: await planningRuntimeProfile() });
}

export function diffPlanBuilderPlanfiles(raw: unknown): unknown {
  const payload = DiffPayload.parse(raw);
  return diffPlanfileMarkdown(payload.old_markdown, payload.new_markdown);
}

function requireSession(sessionId: string) {
  const session = getPlanBuilderSession(sessionId);
  if (!session) throw new HttpError(404, { error: "SESSION_NOT_FOUND", session_id: sessionId, message: "Plan Builder session was not found." });
  return session;
}

function requireReadySession(sessionId: string) {
  const session = requireSession(sessionId);
  if (!session.current_planfile || (session.status !== "ready" && session.status !== "approved")) throw new Error(`Plan Builder session is not ready: ${sessionId}`);
  return { ...session, current_planfile: session.current_planfile };
}

function sessionResponse(session: ReturnType<typeof requireSession>): unknown {
  return {
    ...session,
    ...(session.current_planfile ? { planfile_markdown: renderPlanfileMarkdown(session.current_planfile) } : {}),
  };
}

function modelRouteById(routeId: string) {
  const route = listModelRouteConfigs().find((item) => item.route_id === routeId);
  if (!route) throw new Error(`Unknown model route: ${routeId}`);
  return route;
}

async function planningRuntimeProfile(): Promise<RuntimeProfileForComposition> {
  const profile = await getCurrentProfile().catch(() => undefined);
  if (profile?.searchProviders?.length) {
    return {
      name: profile.name,
      searchProviders: profile.searchProviders.map((provider) => ({
        id: provider.id,
        kind: provider.kind,
        enabled: provider.enabled !== false,
      })),
    };
  }
  return envPlanningRuntimeProfile();
}

function envPlanningRuntimeProfile(): RuntimeProfileForComposition {
  const searchProvider = envSearchProvider();
  return {
    name: process.env.OPEN_LAGRANGE_PROFILE ?? "local",
    ...(searchProvider ? { searchProviders: [searchProvider] } : {}),
  };
}

function envSearchProvider(): NonNullable<RuntimeProfileForComposition["searchProviders"]>[number] | undefined {
  const id = process.env.OPEN_LAGRANGE_SEARCH_PROVIDER ?? process.env.OPEN_LAGRANGE_SEARCH_PROVIDER_ID;
  const baseUrl = process.env.OPEN_LAGRANGE_SEARCH_BASE_URL ?? process.env.OPEN_LAGRANGE_SEARXNG_URL;
  if (!id && !baseUrl) return undefined;
  return {
    id: id ?? "local-searxng",
    kind: process.env.OPEN_LAGRANGE_SEARCH_KIND ?? "searxng",
    enabled: process.env.OPEN_LAGRANGE_SEARCH_ENABLED !== "false",
  };
}
