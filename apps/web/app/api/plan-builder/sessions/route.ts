import { proxyApiRoute, shouldProxyApiRoute } from "../../proxy";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../http";
import { StartSessionPayload, startPlanBuilderSession } from "../handlers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const payload = await parseJson(request, StartSessionPayload);
    return json(await startPlanBuilderSession(payload), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
