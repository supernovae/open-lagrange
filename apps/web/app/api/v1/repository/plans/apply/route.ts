import { z } from "zod";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../../../http";
import { handleApplyRepositoryPlan } from "../../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireMutationSecurity(request);
    const payload = await parseJson(request, z.unknown());
    const result = await handleApplyRepositoryPlan(payload);
    return json(result, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
