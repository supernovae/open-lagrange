import { handleRouteError, json } from "../../../http";
import { handleTaskStatus } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  try {
    const { taskId } = await context.params;
    const status = await handleTaskStatus(taskId);
    return json(status ?? { error: "TASK_NOT_FOUND" }, { status: status ? 200 : 404 });
  } catch (error) {
    return handleRouteError(error);
  }
}
