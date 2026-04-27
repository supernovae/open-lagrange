import { handleRouteError, json, parseJson } from "../../http";
import { handleSubmitProject } from "../handlers";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await parseJson(request, z.unknown());
    const submitted = await handleSubmitProject(payload);
    return json(submitted, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
