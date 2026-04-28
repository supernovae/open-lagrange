import { z } from "zod";
import { handleRouteError, json, parseJson } from "../../../http";
import { handleApplyPlan } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await parseJson(request, z.unknown());
    const result = await handleApplyPlan(payload);
    return json(result, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
