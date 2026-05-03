import { proxyApiRoute, shouldProxyApiRoute } from "../../../../proxy";
import { SavePayload, savePlanBuilderPlanfile } from "../../../handlers";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../../../http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly sessionId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const payload = await parseJson(request, SavePayload);
    const { sessionId } = await context.params;
    return json(savePlanBuilderPlanfile(sessionId, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
