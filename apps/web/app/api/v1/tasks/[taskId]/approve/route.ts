import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../../../http";
import { handleApprove } from "../../../handlers";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  try {
    requireMutationSecurity(request);
    const { taskId } = await context.params;
    const result = await handleApprove(taskId, await parseJson(request, z.unknown()));
    return json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
