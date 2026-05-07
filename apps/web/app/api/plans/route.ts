import { readFileSync } from "node:fs";
import { z } from "zod";
import { checkAndCreateScheduleRecord, listPlanLibraries, listPlanLibraryPlans, parsePlanfileMarkdown, parsePlanfileYaml, runPlanCheck, savePlanfileContentToLibrary, showPlanFromLibrary, withCanonicalPlanDigest } from "@open-lagrange/core/planning-web";
import { getCurrentProfile } from "@open-lagrange/runtime-manager";
import { handleRouteError, json, parseJson, requireApiAuth, requireMutationSecurity } from "../http";
import { proxyApiRoute, shouldProxyApiRoute } from "../proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PlanActionPayload = z.object({
  action: z.enum(["check", "run", "schedule", "save"]),
  plan: z.string().min(1).optional(),
  library: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  cadence: z.enum(["daily", "weekly", "cron"]).optional(),
  time_of_day: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
}).strict();

export async function GET(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireApiAuth(request);
    const url = new URL(request.url);
    const library = url.searchParams.get("library") ?? undefined;
    const plan = url.searchParams.get("plan") ?? undefined;
    if (plan) return json(showPlanFromLibrary({ plan, ...(library ? { library } : {}) }));
    return json({
      libraries: listPlanLibraries(),
      plans: listPlanLibraryPlans({ ...(library ? { library } : {}) }),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const payload = await parseJson(request, PlanActionPayload);
    if (payload.action === "save") {
      if (!payload.content || !payload.path) throw new Error("content and path are required to save a Planfile.");
      return json(savePlanfileContentToLibrary({
        content: payload.content,
        path: payload.path,
        ...(payload.library ? { library: payload.library } : {}),
      }), { status: 201 });
    }
    const planfile = withCanonicalPlanDigest(planfileFromPayload(payload));
    const runtimeProfile = await getCurrentProfile().catch(() => undefined);
    if (payload.action === "check") {
      return json(runPlanCheck({ planfile, live: true, ...(runtimeProfile ? { runtime_profile: runtimeProfile } : {}) }));
    }
    if (payload.action === "schedule") {
      return json(checkAndCreateScheduleRecord({
        planfile,
        planfile_path: payload.plan ?? payload.path ?? planfile.plan_id,
        cadence: payload.cadence ?? "daily",
        ...(payload.time_of_day ? { time_of_day: payload.time_of_day } : {}),
        ...(payload.timezone ? { timezone: payload.timezone } : {}),
        runtime_profile: runtimeProfile?.name ?? "local",
      }), { status: 201 });
    }
    const report = runPlanCheck({ planfile, live: true, ...(runtimeProfile ? { runtime_profile: runtimeProfile } : {}) });
    if (report.status === "invalid" || report.status === "unsafe" || report.status === "missing_requirements") {
      return json({
        status: "blocked",
        run_created: false,
        plan_check_report: report,
        message: `Plan Check blocked run creation: ${report.status}.`,
      });
    }
    return json({
      status: "ready",
      plan_check_report: report,
      planfile,
      message: "Create the Durable Run through /api/runs with this Planfile.",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function planfileFromPayload(payload: z.infer<typeof PlanActionPayload>) {
  if (payload.content) return parsePlanfileMarkdown(payload.content);
  if (!payload.plan) throw new Error("plan is required.");
  const detail = showPlanFromLibrary({ plan: payload.plan, ...(payload.library ? { library: payload.library } : {}) });
  if (detail.entry.path.endsWith(".yaml") || detail.entry.path.endsWith(".yml")) return parsePlanfileYaml(readFileSync(detail.entry.path, "utf8"));
  return parsePlanfileMarkdown(detail.content);
}
