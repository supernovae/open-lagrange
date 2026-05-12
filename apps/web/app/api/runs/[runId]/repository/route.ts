import { buildRepositoryRunView } from "@open-lagrange/core/repository";
import { handleRouteError, json, requireApiAuth } from "../../../http";
import { proxyApiRoute, shouldProxyApiRoute } from "../../../proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { readonly params: Promise<{ readonly runId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireApiAuth(request);
    const { runId } = await params;
    const view = await buildRepositoryRunView({ ref: runId });
    return json(view ?? { status: "missing", run_id: runId }, { status: view ? 200 : 404 });
  } catch (error) {
    return handleRouteError(error);
  }
}
