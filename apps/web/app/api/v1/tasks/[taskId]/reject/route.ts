import { proxyApiRoute, shouldProxyApiRoute } from "../../../../proxy";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../../../http";
import { handleReject } from "../../../handlers";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const { taskId } = await context.params;
    const result = await handleReject(taskId, await parseJson(request, z.unknown()));
    return json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
