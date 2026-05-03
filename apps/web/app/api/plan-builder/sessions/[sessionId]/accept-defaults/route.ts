import { proxyApiRoute, shouldProxyApiRoute } from "../../../../proxy";
import { acceptPlanBuilderDefaults } from "../../../handlers";
import { handleRouteError, json, requireMutationSecurity } from "../../../../http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly sessionId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireMutationSecurity(request);
    const { sessionId } = await context.params;
    return json(await acceptPlanBuilderDefaults(sessionId));
  } catch (error) {
    return handleRouteError(error);
  }
}
