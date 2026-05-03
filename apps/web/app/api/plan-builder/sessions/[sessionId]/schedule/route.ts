import { proxyApiRoute, shouldProxyApiRoute } from "../../../../proxy";
import { SchedulePayload, schedulePlanBuilderPlanfile } from "../../../handlers";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../../../http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly sessionId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const payload = await parseJson(request, SchedulePayload);
    const { sessionId } = await context.params;
    return json(schedulePlanBuilderPlanfile(sessionId, payload), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
