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
        function send(event: string, data: unknown, id?: string): void {
          const lines = [`event: ${event}`, ...(id ? [`id: ${id}`] : []), `data: ${JSON.stringify(data)}`, ""];
          controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
        }
        async function sendSnapshot(): Promise<void> {
          send("run.snapshot", await buildRunSnapshot({ run_id: runId }));
        }
        async function sendEventsAfterCursor(): Promise<void> {
          const events = await getStateStore().listRunEventsAfter(runId, cursorEventId);
          for (const item of events) {
            cursorEventId = item.event_id;
            send("run.event", item, item.event_id);
          }
          if (events.length > 0) await sendSnapshot();
        }
        await sendEventsAfterCursor();
        send("run.snapshot", await buildRunSnapshot({ run_id: runId }));
        const unsubscribe = subscribeRunEvents(runId, (item) => {
          cursorEventId = item.event_id;
          send("run.event", item, item.event_id);
          void buildRunSnapshot({ run_id: runId }).then((snapshot) => send("run.snapshot", snapshot));
        });
        const poll = setInterval(() => {
          void sendEventsAfterCursor();
        }, 1500);
        const heartbeat = setInterval(() => send("heartbeat", { run_id: runId, now: new Date().toISOString() }), 15000);
        request.signal.addEventListener("abort", () => {
          clearInterval(poll);
          clearInterval(heartbeat);
          unsubscribe();
          controller.close();
        });
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
