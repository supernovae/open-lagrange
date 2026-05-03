import { proxyApiRoute, shouldProxyApiRoute } from "../../proxy";
import { handleRouteError, json, requireApiAuth } from "../../http";
import { handleRunSnapshot } from "../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { readonly params: Promise<{ readonly runId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireApiAuth(request);
    const { runId } = await context.params;
    return json(await handleRunSnapshot(runId));
  } catch (error) {
    return handleRouteError(error);
  }
}
