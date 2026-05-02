import { enforceRateLimit, handleRouteError, json, requireApiAuth } from "../http";
import { handleWorkbenchOverview } from "./handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    requireApiAuth(request);
    enforceRateLimit(request);
    return json(await handleWorkbenchOverview());
  } catch (error) {
    return handleRouteError(error);
  }
}
