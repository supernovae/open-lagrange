import { parseJson, handleRouteError, json, requireMutationSecurity } from "../../http";
import { ReconcilePayload, reconcilePlanBuilderPlanfile } from "../handlers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    requireMutationSecurity(request);
    return json(reconcilePlanBuilderPlanfile(await parseJson(request, ReconcilePayload)));
  } catch (error) {
    return handleRouteError(error);
  }
}
