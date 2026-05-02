import { handleRouteError, json, requireApiAuth } from "../../../http";
import { readPlanBuilderSession } from "../../handlers";

export const runtime = "nodejs";

export async function GET(request: Request, context: { readonly params: Promise<{ readonly sessionId: string }> }): Promise<Response> {
  try {
    requireApiAuth(request);
    const { sessionId } = await context.params;
    return json(readPlanBuilderSession(sessionId));
  } catch (error) {
    return handleRouteError(error);
  }
}
