import { RunPayload, runPlanBuilderPlanfile } from "../../../handlers";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../../../http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly sessionId: string }> }): Promise<Response> {
  try {
    requireMutationSecurity(request);
    const payload = await parseJson(request, RunPayload);
    const { sessionId } = await context.params;
    return json(await runPlanBuilderPlanfile(sessionId, payload), { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
