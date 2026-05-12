import { z } from "zod";
import { clearWebSessionCookie, createWebSessionCookie, requestHasValidWebSession } from "../web-session";
import { handleRouteError, HttpError, json, parseJson } from "../../http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginRequest = z.object({
  token: z.string().min(1),
}).strict();

export async function GET(request: Request): Promise<Response> {
  return json({ authenticated: requestHasValidWebSession(request) });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await parseJson(request, LoginRequest);
    const cookie = createWebSessionCookie(body.token);
    return json({ authenticated: true }, { headers: { "set-cookie": cookie } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return json({ error: "UNAUTHORIZED" }, { status: 401 });
    if (error instanceof Error && error.message === "API_AUTH_NOT_CONFIGURED") return handleRouteError(new HttpError(503, { error: "API_AUTH_NOT_CONFIGURED" }));
    return handleRouteError(error);
  }
}

export async function DELETE(): Promise<Response> {
  return json({ authenticated: false }, { headers: { "set-cookie": clearWebSessionCookie() } });
}
