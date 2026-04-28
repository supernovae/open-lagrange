import { z } from "zod";
import { handleRouteError, json, parseJson } from "../../../../http";
import { handleApprovePlan } from "../../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { readonly params: Promise<{ readonly planId: string }> }): Promise<Response> {
  try {
    const payload = await parseJson(request, z.unknown());
    const { planId } = await context.params;
    return json(await handleApprovePlan(planId, payload), { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
