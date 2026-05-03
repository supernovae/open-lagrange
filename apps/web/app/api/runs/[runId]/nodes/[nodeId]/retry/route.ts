import { proxyApiRoute, shouldProxyApiRoute } from "../../../../../proxy";
import { z } from "zod";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../../../../http";
import { handleRetryRunNode } from "../../../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly runId: string; readonly nodeId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const { runId, nodeId } = await context.params;
    return json(await handleRetryRunNode(runId, nodeId, await parseJson(request, z.unknown())), { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
