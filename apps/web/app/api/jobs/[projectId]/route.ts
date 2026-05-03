import { proxyApiRoute, shouldProxyApiRoute } from "../../proxy";
import { getProjectStatus } from "@open-lagrange/core/interface";
import { handleRouteError, json } from "../../http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(_request);
  try {
    const { projectId } = await context.params;
    const status = await getProjectStatus(projectId);
    return json(status);
  } catch (error) {
    return handleRouteError(error);
  }
}
