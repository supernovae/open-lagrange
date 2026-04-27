import { ZodError, type z } from "zod";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  try {
    return schema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, { error: "INVALID_REQUEST", issues: error.issues });
    }
    throw error;
  }
}

export function handleRouteError(error: unknown): Response {
  if (error instanceof HttpError) return json(error.body, { status: error.status });
  const message = error instanceof Error ? error.message : "Unknown error";
  return json({ error: "REQUEST_FAILED", message }, { status: 500 });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
  }
}
