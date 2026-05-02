import { enforceRateLimit, handleRouteError, json, requireApiAuth } from "../../http";
import { handleWorkbenchApprovals } from "../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  try {
    requireApiAuth(request);
    enforceRateLimit(request);
    return json(handleWorkbenchApprovals());
  } catch (error) {
    return handleRouteError(error);
  }
}
