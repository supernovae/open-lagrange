import { handleRouteError, json } from "../../../../http";
import { handleResumePlan } from "../../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { readonly params: Promise<{ readonly planId: string }> }): Promise<Response> {
  try {
    const { planId } = await context.params;
    return json(await handleResumePlan(planId), { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
