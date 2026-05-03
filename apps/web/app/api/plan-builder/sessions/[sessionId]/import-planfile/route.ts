import { proxyApiRoute, shouldProxyApiRoute } from "../../../../proxy";
import { parseJson, handleRouteError, json, requireMutationSecurity } from "../../../../http";
import { ImportPlanfilePayload, importPlanBuilderPlanfile } from "../../../handlers";

export const runtime = "nodejs";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly sessionId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const { sessionId } = await context.params;
    return json(await importPlanBuilderPlanfile(sessionId, await parseJson(request, ImportPlanfilePayload)));
  } catch (error) {
    return handleRouteError(error);
  }
}
