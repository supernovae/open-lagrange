import { proxyApiRoute, shouldProxyApiRoute } from "../../proxy";
import { parseJson, handleRouteError, json, requireMutationSecurity } from "../../http";
import { ReconcilePayload, reconcilePlanBuilderPlanfile } from "../handlers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    return json(await reconcilePlanBuilderPlanfile(await parseJson(request, ReconcilePayload)));
  } catch (error) {
    return handleRouteError(error);
  }
}
