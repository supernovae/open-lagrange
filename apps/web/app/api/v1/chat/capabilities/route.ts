import { handleRouteError, json } from "../../../http";
import { handleCapabilitiesSummary } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return json(await handleCapabilitiesSummary());
  } catch (error) {
    return handleRouteError(error);
  }
}
