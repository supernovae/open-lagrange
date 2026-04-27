import { handleRouteError, json } from "../../../http";
import { handleRuntimePacks } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  try {
    return json(handleRuntimePacks());
  } catch (error) {
    return handleRouteError(error);
  }
}
