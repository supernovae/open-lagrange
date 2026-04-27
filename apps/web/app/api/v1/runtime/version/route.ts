import { handleRouteError, json } from "../../../http";
import { handleRuntimeVersion } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  try {
    return json(handleRuntimeVersion());
  } catch (error) {
    return handleRouteError(error);
  }
}
