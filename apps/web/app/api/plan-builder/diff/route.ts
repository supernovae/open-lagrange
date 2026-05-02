import { parseJson, handleRouteError, json, requireMutationSecurity } from "../../http";
import { DiffPayload, diffPlanBuilderPlanfiles } from "../handlers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    requireMutationSecurity(request);
    return json(diffPlanBuilderPlanfiles(await parseJson(request, DiffPayload)));
  } catch (error) {
    return handleRouteError(error);
  }
}
