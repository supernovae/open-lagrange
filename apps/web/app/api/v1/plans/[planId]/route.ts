import { handleRouteError, json } from "../../../http";
import { handlePlanStatus } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { readonly params: Promise<{ readonly planId: string }> }): Promise<Response> {
  try {
    const { planId } = await context.params;
    const result = await handlePlanStatus(planId);
    return json(result ?? { plan_id: planId, status: "missing" });
  } catch (error) {
    return handleRouteError(error);
  }
}
