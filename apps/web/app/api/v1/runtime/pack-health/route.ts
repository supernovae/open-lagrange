import { handleRouteError, json } from "../../../http";
import { handleRuntimePackHealth } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return json(await handleRuntimePackHealth());
  } catch (error) {
    return handleRouteError(error);
  }
}
