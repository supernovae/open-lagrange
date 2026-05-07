import { subscribeRunEvents, RunEventEnvelope, type RunEventEnvelope as RunEventEnvelopeType } from "@open-lagrange/core/runs";
import { stripSecretValue } from "@open-lagrange/core/secrets";
import { getStateStore } from "@open-lagrange/core/storage";
import { proxyApiRoute, shouldProxyApiRoute } from "../../../../proxy";
import { handleRouteError, requireApiAuth } from "../../../../http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const replayLimit = 500;
const pollIntervalMs = 1500;
const heartbeatIntervalMs = 15000;

export async function GET(request: Request, context: { readonly params: Promise<{ readonly runId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireApiAuth(request);
    const { runId } = await context.params;
    const url = new URL(request.url);
    const cursor = url.searchParams.get("after") ?? request.headers.get("last-event-id") ?? undefined;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let cursorEventId = cursor;
        let closed = false;
        let unsubscribe: (() => void) | undefined;
        let poll: ReturnType<typeof setInterval> | undefined;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const onAbort = (): void => cleanup();
        const cleanup = (): void => {
          if (closed) return;
          closed = true;
          if (poll) clearInterval(poll);
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe?.();
          request.signal.removeEventListener("abort", onAbort);
          try {
            controller.close();
          } catch {
            // The response may already be closed by the client runtime.
          }
        };
        request.signal.addEventListener("abort", onAbort, { once: true });
        const write = (text: string): void => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            cleanup();
          }
        };
        const sendError = (code: string, message: string, retryable: boolean): void => {
          write(sseFrame({ event: "run.error", data: { code, message, retryable } }));
        };
        const sendEnvelope = (envelope: RunEventEnvelopeType): void => {
          const parsed = RunEventEnvelope.parse(envelope);
          cursorEventId = parsed.event_id;
          write(sseFrame({ event: "run.event", id: parsed.event_id, data: stripSecretValue(parsed) }));
        };
        const sendReplay = async (): Promise<void> => {
          const store = getStateStore();
          const replay = await store.listRunEvents(runId, { ...(cursorEventId ? { after: cursorEventId } : {}), limit: replayLimit + 1 });
          if (replay.length > replayLimit) {
            sendError("RUN_EVENT_REPLAY_LIMIT_EXCEEDED", "Too many missed events. Refetch the RunSnapshot and reconnect from the latest event cursor.", true);
            return;
          }
          for (const envelope of replay) {
            if (closed) return;
            sendEnvelope(envelope);
          }
        };
        try {
          write("retry: 2000\n\n");
          await sendReplay();
          unsubscribe = subscribeRunEvents(runId, (envelope) => {
            if (closed) return;
            if (envelope.event_id === cursorEventId) return;
            sendEnvelope(envelope);
          });
          poll = setInterval(() => {
            void sendReplay().catch((error) => {
              sendError("RUN_EVENT_REPLAY_FAILED", error instanceof Error ? error.message : "Run event replay failed.", true);
            });
          }, pollIntervalMs);
          heartbeat = setInterval(() => {
            write(`: heartbeat ${new Date().toISOString()}\n\n`);
          }, heartbeatIntervalMs);
        } catch (error) {
          sendError("RUN_EVENT_STREAM_FAILED", error instanceof Error ? error.message : "Run event stream failed.", true);
          cleanup();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function sseFrame(input: { readonly event: string; readonly data: unknown; readonly id?: string }): string {
  return [
    ...(input.id ? [`id: ${input.id}`] : []),
    `event: ${input.event}`,
    `data: ${JSON.stringify(input.data)}`,
    "",
    "",
  ].join("\n");
}
