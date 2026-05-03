import { proxyApiRoute, shouldProxyApiRoute } from "../../../../../proxy";
import { z } from "zod";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../../../../http";
import { handleApproveRepositoryScopeRequest } from "../../../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly requestId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const { requestId } = await context.params;
    return json(await handleApproveRepositoryScopeRequest(requestId, await parseJson(request, z.unknown())), { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
