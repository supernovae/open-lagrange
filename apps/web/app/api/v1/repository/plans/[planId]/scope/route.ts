import { proxyApiRoute, shouldProxyApiRoute } from "../../../../../proxy";
import { handleRouteError, json } from "../../../../../http";
import { handlePendingRepositoryScopeRequests } from "../../../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { readonly params: Promise<{ readonly planId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(_request);
  try {
    const { planId } = await context.params;
    return json(handlePendingRepositoryScopeRequests(planId));
  } catch (error) {
    return handleRouteError(error);
  }
}
