import { proxyApiRoute, shouldProxyApiRoute } from "../../proxy";
import { parseJson, handleRouteError, json, requireMutationSecurity } from "../../http";
import { DiffPayload, diffPlanBuilderPlanfiles } from "../handlers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    return json(diffPlanBuilderPlanfiles(await parseJson(request, DiffPayload)));
  } catch (error) {
    return handleRouteError(error);
  }
}
