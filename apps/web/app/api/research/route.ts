import { z } from "zod";
import { buildResearchRunViewForRun, checkAndCreateResearchRun, composeResearchPlan, exportResearchViewArtifact, saveResearchPlanToLibrary, scheduleResearchPlan, writeResearchPlanfile } from "@open-lagrange/core/research";
import { getCurrentProfile } from "@open-lagrange/runtime-manager";
import { handleRouteError, HttpError, json, parseJson, requireApiAuth, requireMutationSecurity } from "../http";
import { proxyApiRoute, shouldProxyApiRoute } from "../proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ResearchPayload = z.object({
  action: z.enum(["plan", "run", "view", "save", "schedule", "export"]),
  topic: z.string().min(1).optional(),
  provider_id: z.string().min(1).optional(),
  urls: z.array(z.string().min(1)).default([]),
  max_sources: z.number().int().min(1).max(25).default(5),
  brief_style: z.enum(["concise", "standard", "technical", "executive"]).default("standard"),
  include_recommendations: z.boolean().default(false),
  run_id: z.string().min(1).optional(),
  markdown: z.string().min(1).optional(),
  library: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  cadence: z.enum(["daily", "weekly", "cron"]).default("daily"),
  time_of_day: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  artifact_id: z.string().min(1).optional(),
  output_path: z.string().min(1).optional(),
}).strict();

export async function GET(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireApiAuth(request);
    const url = new URL(request.url);
    const runId = url.searchParams.get("run_id");
    if (!runId) return json({ status: "ready", message: "Provide run_id to load a Research Workbench view." });
    return json(await buildResearchRunViewForRun({ run_id: runId }) ?? { status: "missing", run_id: runId }, { status: 200 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const payload = await parseJson(request, ResearchPayload);
    const profile = await getCurrentProfile().catch(() => undefined);
    if (payload.action === "view") {
      return json(await buildResearchRunViewForRun({ run_id: required(payload.run_id, "RUN_ID_REQUIRED") }) ?? { status: "missing", run_id: payload.run_id });
    }
    if (payload.action === "export") {
      return json(exportResearchViewArtifact({
        artifact_id: required(payload.artifact_id, "ARTIFACT_ID_REQUIRED"),
        output_path: required(payload.output_path, "OUTPUT_PATH_REQUIRED"),
      }));
    }
    const topic = required(payload.topic, "TOPIC_REQUIRED");
    const plan = await composeResearchPlan({
      topic,
      ...(payload.provider_id ? { provider_id: payload.provider_id } : {}),
      ...(payload.urls.length > 0 ? { urls: payload.urls } : {}),
      max_sources: payload.max_sources,
      brief_style: payload.brief_style,
      include_recommendations: payload.include_recommendations,
      ...(profile ? { runtime_profile: profile } : {}),
    });
    if (payload.action === "plan") return json(plan);
    if (payload.action === "save") {
      return json(saveResearchPlanToLibrary({
        markdown: payload.markdown ?? plan.markdown,
        topic,
        ...(payload.library ? { library: payload.library } : {}),
        ...(payload.path ? { path: payload.path } : {}),
      }), { status: 201 });
    }
    if (payload.action === "schedule") {
      const written = writeResearchPlanfile({ markdown: payload.markdown ?? plan.markdown, topic, ...(payload.path ? { path: payload.path } : {}) });
      return json({
        plan,
        schedule: scheduleResearchPlan({
          planfile: plan.planfile,
          planfile_path: written.path,
          cadence: payload.cadence,
          ...(payload.time_of_day ? { time_of_day: payload.time_of_day } : {}),
          ...(payload.timezone ? { timezone: payload.timezone } : {}),
          runtime_profile: profile?.name ?? "local",
        }),
      }, { status: 201 });
    }
    const result = await checkAndCreateResearchRun({
      topic,
      ...(payload.provider_id ? { provider_id: payload.provider_id } : {}),
      ...(payload.urls.length > 0 ? { urls: payload.urls } : {}),
      max_sources: payload.max_sources,
      brief_style: payload.brief_style,
      include_recommendations: payload.include_recommendations,
      ...(profile ? { runtime_profile: profile } : {}),
    });
    return json(result, { status: result.status === "created" ? 202 : 200 });
  } catch (error) {
    return handleRouteError(error);
  }
}

function required<T>(value: T | undefined, code: string): T {
  if (value === undefined) throw new HttpError(400, { error: code });
  return value;
}
