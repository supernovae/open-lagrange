import { proxyApiRoute, shouldProxyApiRoute } from "../../../proxy";
import { z } from "zod";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../../http";
import { handleApplyPlan } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const payload = await parseJson(request, z.unknown());
    const result = await handleApplyPlan(payload);
    return json(result, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
