import { proxyApiRoute, shouldProxyApiRoute } from "../../../proxy";
import { handleRouteError, json } from "../../../http";
import { handleProjectStatus } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(_request);
  try {
    const { projectId } = await context.params;
    return json(await handleProjectStatus(projectId));
  } catch (error) {
    return handleRouteError(error);
  }
}
