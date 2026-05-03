import { proxyApiRoute, shouldProxyApiRoute } from "../../../proxy";
import { z } from "zod";
import { handleRouteError, json, parseJson, requireApiAuth, requireMutationSecurity } from "../../../http";
import { handleRunUiState, handleUpdateRunUiState } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { readonly params: Promise<{ readonly runId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireApiAuth(request);
    const { runId } = await context.params;
    return json(await handleRunUiState(runId, request));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, context: { readonly params: Promise<{ readonly runId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const { runId } = await context.params;
    return json(await handleUpdateRunUiState(runId, request, await parseJson(request, z.unknown())));
  } catch (error) {
    return handleRouteError(error);
  }
}
