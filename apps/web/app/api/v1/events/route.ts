import { handleRouteError, json, parseJson, requireMutationSecurity } from "../../http";
import { handleEvent } from "../handlers";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireMutationSecurity(request);
    return json(await handleEvent(await parseJson(request, z.unknown())));
  } catch (error) {
    return handleRouteError(error);
  }
}
