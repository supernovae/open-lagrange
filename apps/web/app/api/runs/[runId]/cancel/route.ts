import { proxyApiRoute, shouldProxyApiRoute } from "../../../proxy";
import { handleRouteError, json, requireMutationSecurity } from "../../../http";
import { handleCancelRun } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly runId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const { runId } = await context.params;
    return json(await handleCancelRun(runId), { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
