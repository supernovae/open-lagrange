import { handleRouteError, json } from "../../../http";
import { handleArtifact } from "../../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ artifactId: string }> }): Promise<Response> {
  try {
    const { artifactId } = await context.params;
    return json(await handleArtifact(artifactId, request));
  } catch (error) {
    return handleRouteError(error);
  }
}
