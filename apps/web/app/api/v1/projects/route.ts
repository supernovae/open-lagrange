import { proxyApiRoute, shouldProxyApiRoute } from "../../proxy";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../http";
import { handleSubmitProject } from "../handlers";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const payload = await parseJson(request, z.unknown());
    const submitted = await handleSubmitProject(payload);
    return json(submitted, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
