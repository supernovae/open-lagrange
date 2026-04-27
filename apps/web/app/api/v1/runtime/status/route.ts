import { handleRouteError, json } from "../../../http";
import { handleRuntimeStatus } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return json(await handleRuntimeStatus());
  } catch (error) {
    return handleRouteError(error);
  }
}
