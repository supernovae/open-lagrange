import { buildRunSnapshot, subscribeRunEvents } from "@open-lagrange/core/runs";
import { getStateStore } from "@open-lagrange/core/storage";
import { proxyApiRoute, shouldProxyApiRoute } from "../../../proxy";
import { handleRouteError, requireApiAuth } from "../../../http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { readonly params: Promise<{ readonly runId: string }> }): Promise<Response> {
  if (shouldProxyApiRoute()) return proxyApiRoute(request);
  try {
    requireApiAuth(request);
    const { runId } = await context.params;
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let cursorEventId = cursor;
        let closed = false;
        let unsubscribe: (() => void) | undefined;
        let poll: ReturnType<typeof setInterval> | undefined;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const onAbort = (): void => cleanup(true);
        const cleanup = (closeController = true): void => {
          if (closed) return;
          closed = true;
          if (poll) clearInterval(poll);
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe?.();
          request.signal.removeEventListener("abort", onAbort);
          if (!closeController) return;
          try {
            controller.close();
          } catch {
            // The stream may already be closed by the runtime.
          }
        };
        request.signal.addEventListener("abort", onAbort, { once: true });
        function send(event: string, data: unknown, id?: string): void {
          if (closed) return;
          const lines = [`event: ${event}`, ...(id ? [`id: ${id}`] : []), `data: ${JSON.stringify(data)}`, ""];
          try {
            controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
          } catch {
            cleanup();
          }
        }
        async function sendSnapshot(): Promise<void> {
          send("run.snapshot", await buildRunSnapshot({ run_id: runId }));
        }
        async function sendEventsAfterCursor(): Promise<void> {
          if (closed) return;
          const events = await getStateStore().listRunEventsAfter(runId, cursorEventId);
          for (const item of events) {
            if (closed) return;
            cursorEventId = item.event_id;
            send("run.event", item, item.event_id);
          }
          if (events.length > 0) await sendSnapshot();
        }
        try {
          await sendEventsAfterCursor();
          if (closed) return;
          send("run.snapshot", await buildRunSnapshot({ run_id: runId }));
          unsubscribe = subscribeRunEvents(runId, (item) => {
            if (closed) return;
            cursorEventId = item.event_id;
            send("run.event", item, item.event_id);
            void buildRunSnapshot({ run_id: runId })
              .then((snapshot) => send("run.snapshot", snapshot))
              .catch(() => cleanup());
          });
          poll = setInterval(() => {
            void sendEventsAfterCursor().catch(() => cleanup());
          }, 1500);
          heartbeat = setInterval(() => send("heartbeat", { run_id: runId, now: new Date().toISOString() }), 15000);
        } catch (error) {
          cleanup(false);
          try {
            controller.error(error);
          } catch {
            // The stream may already be closed by cleanup.
          }
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
