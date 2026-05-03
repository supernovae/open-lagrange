import { proxyApiRoute, shouldProxyApiRoute } from "../../proxy";
import { enforceRateLimit, handleRouteError, json, requireApiAuth } from "../../http";
import { handleWorkbenchApprovals } from "../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireApiAuth(request);
    enforceRateLimit(request);
    return json(handleWorkbenchApprovals());
  } catch (error) {
    return handleRouteError(error);
  }
}
