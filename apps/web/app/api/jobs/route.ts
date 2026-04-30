import { createMockDelegationContext, DEFAULT_EXECUTION_BOUNDS, submitProject } from "@open-lagrange/core/interface";
import { handleRouteError, json, parseJson, requireMutationSecurity } from "../http";
import { SubmitJobPayload } from "./schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireMutationSecurity(request);
    const payload = await parseJson(request, SubmitJobPayload);
    const delegation_context = createMockDelegationContext({
      goal: payload.goal,
      delegate_id: "open-lagrange-web",
      ...(payload.workspace_id ? { workspace_id: payload.workspace_id } : {}),
      ...(payload.project_id ? { project_id: payload.project_id } : {}),
      ...(payload.allowed_scopes ? { allowed_scopes: payload.allowed_scopes } : {}),
    });
    const submitted = await submitProject({
      goal: payload.goal,
      delegation_context,
      bounds: DEFAULT_EXECUTION_BOUNDS,
      ...(payload.project_id ? { project_id: payload.project_id } : {}),
    });
    return json({
      ...submitted,
      status: "accepted",
      status_url: `/api/jobs/${submitted.project_id}`,
    }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
