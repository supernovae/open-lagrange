import { rejectTask } from "@open-lagrange/core/interface";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../../http";
import { RejectPayload } from "../decision-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  try {
    requireMutationSecurity(request);
    const { taskId } = await context.params;
    const payload = await parseJson(request, RejectPayload);
    const result = await rejectTask({
      task_id: taskId,
      decided_by: payload.rejected_by,
      reason: payload.reason,
      approval_token: payload.approval_token,
    });
    return json(result.decision ? result : { error: "APPROVAL_NOT_FOUND" }, { status: result.decision ? 200 : 404 });
  } catch (error) {
    return handleRouteError(error);
  }
}
