import { proxyApiRoute, shouldProxyApiRoute } from "../proxy";
import { z } from "zod";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../http";
import { handleCreateRun } from "./handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    return json(await handleCreateRun(await parseJson(request, z.unknown())), { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
