import { proxyApiRoute, shouldProxyApiRoute } from "../../../../../proxy";
import { z } from "zod";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../../../../http";
import { handleResolveRunApproval } from "../../../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly runId: string; readonly approvalId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const { runId, approvalId } = await context.params;
    return json(await handleResolveRunApproval(runId, approvalId, await parseJson(request, z.unknown()), "approved"));
  } catch (error) {
    return handleRouteError(error);
  }
}
