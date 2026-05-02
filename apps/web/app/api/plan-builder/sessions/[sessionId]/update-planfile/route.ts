import { parseJson, handleRouteError, json, requireMutationSecurity } from "../../../../http";
import { UpdatePlanfilePayload, updatePlanBuilderPlanfile } from "../../../handlers";

export const runtime = "nodejs";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly sessionId: string }> }): Promise<Response> {
  try {
    requireMutationSecurity(request);
    const { sessionId } = await context.params;
    return json(await updatePlanBuilderPlanfile(sessionId, await parseJson(request, UpdatePlanfilePayload)));
  } catch (error) {
    return handleRouteError(error);
  }
}
