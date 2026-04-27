import { getTaskStatus } from "@open-lagrange/core/interface";
import { handleRouteError, json } from "../../http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  try {
    const { taskId } = await context.params;
    const status = await getTaskStatus(taskId);
    return json(status ?? { error: "TASK_NOT_FOUND" }, { status: status ? 200 : 404 });
  } catch (error) {
    return handleRouteError(error);
  }
}
