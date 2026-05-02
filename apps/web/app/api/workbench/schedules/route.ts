import { enforceRateLimit, handleRouteError, json, requireApiAuth } from "../../http";
import { handleWorkbenchSchedules } from "../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  try {
    requireApiAuth(request);
    enforceRateLimit(request);
    return json(handleWorkbenchSchedules());
  } catch (error) {
    return handleRouteError(error);
  }
}
