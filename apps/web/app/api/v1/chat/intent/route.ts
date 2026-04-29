import { z } from "zod";
import { handleRouteError, json, parseJson } from "../../../http";
import { handleIntentClassify } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    return json(handleIntentClassify(await parseJson(request, z.unknown())));
  } catch (error) {
    return handleRouteError(error);
  }
}
