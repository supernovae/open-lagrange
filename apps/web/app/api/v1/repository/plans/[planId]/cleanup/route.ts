import { handleRouteError, json, requireMutationSecurity } from "../../../../../http";
import { handleCleanupRepositoryPlan } from "../../../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly planId: string }> }): Promise<Response> {
  try {
    requireMutationSecurity(request);
    const { planId } = await context.params;
    return json(await handleCleanupRepositoryPlan(planId), { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
