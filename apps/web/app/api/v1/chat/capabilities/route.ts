import { proxyApiRoute, shouldProxyApiRoute } from "../../../proxy";
import { handleRouteError, json } from "../../../http";
import { handleCapabilitiesSummary } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    return json(await handleCapabilitiesSummary());
  } catch (error) {
    return handleRouteError(error);
  }
}
