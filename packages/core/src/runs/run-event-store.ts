import { RunEvent, type RunEvent as RunEventType } from "./run-event.js";
import { RunRuntime } from "./run.js";
import { z } from "zod";

export const RunEventEnvelope = z.object({
  event_id: z.string().min(1),
  run_id: z.string().min(1),
  sequence: z.number().int().min(1),
  timestamp: z.string().datetime(),
  runtime: RunRuntime,
  event: RunEvent,
}).strict();

export type RunEventEnvelope = z.infer<typeof RunEventEnvelope>;

export interface RunEventListOptions {
  readonly after?: string;
  readonly limit?: number;
}

export interface RunEventStore {
  readonly appendRunEvent: (event: RunEventType) => Promise<RunEventEnvelope>;
  readonly listRunEvents: (runId: string, options?: RunEventListOptions) => Promise<readonly RunEventEnvelope[]>;
  readonly listRunEventsAfter: (runId: string, cursorEventId?: string) => Promise<readonly RunEventEnvelope[]>;
  readonly getLatestEventId: (runId: string) => Promise<string | undefined>;
  readonly listRecentRunIds: (limit?: number) => Promise<readonly string[]>;
}

const runEvents = new Map<string, RunEventType[]>();
const subscribers = new Map<string, Set<(event: RunEventEnvelope) => void>>();

export const inMemoryRunEventStore: RunEventStore = {
  async appendRunEvent(event) {
    const parsed = RunEvent.parse(event);
    const events = runEvents.get(parsed.run_id) ?? [];
    if (!events.some((item) => item.event_id === parsed.event_id)) events.push(parsed);
    const sorted = sortEvents(events);
    runEvents.set(parsed.run_id, sorted);
    const envelope = envelopeFor(parsed, sorted);
    publishRunEventEnvelope(envelope);
    return envelope;
  },
  async listRunEvents(runId, options = {}) {
    const envelopes = sortEvents(runEvents.get(runId) ?? []).map((event, index) => envelopeFor(event, undefined, index + 1));
    return limitEnvelopes(eventsAfter(envelopes, options.after), options.limit);
  },
  async listRunEventsAfter(runId, cursorEventId) {
    return this.listRunEvents(runId, cursorEventId ? { after: cursorEventId } : {});
  },
  async getLatestEventId(runId) {
    return (await this.listRunEvents(runId)).at(-1)?.event_id;
  },
  async listRecentRunIds(limit = 20) {
    return [...runEvents.entries()]
      .map(([runId, events]) => ({ runId, timestamp: events.at(-1)?.timestamp ?? "" }))
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, limit)
      .map((item) => item.runId);
  },
};

export function subscribeRunEvents(runId: string, onEvent: (event: RunEventEnvelope) => void): () => void {
  const set = subscribers.get(runId) ?? new Set();
  set.add(onEvent);
  subscribers.set(runId, set);
  return () => {
    set.delete(onEvent);
    if (set.size === 0) subscribers.delete(runId);
  };
}

export function publishRunEventEnvelope(envelope: RunEventEnvelope): void {
  const parsed = RunEventEnvelope.parse(envelope);
  for (const subscriber of subscribers.get(parsed.run_id) ?? []) subscriber(parsed);
}

export async function* subscribeRunEventStream(runId: string, signal?: AbortSignal): AsyncIterable<RunEventEnvelope> {
  const queue: RunEventEnvelope[] = [];
  let notify: (() => void) | undefined;
  const unsubscribe = subscribeRunEvents(runId, (event) => {
    queue.push(event);
    notify?.();
  });
  const abort = (): void => { notify?.(); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (!signal?.aborted) {
      const item = queue.shift();
      if (item) {
        yield item;
        continue;
      }
      await new Promise<void>((resolve) => { notify = resolve; });
      notify = undefined;
    }
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", abort);
  }
}

export function eventsAfter<T extends { readonly event_id: string }>(events: readonly T[], cursorEventId?: string): readonly T[] {
  if (!cursorEventId) return events;
  const index = events.findIndex((event) => event.event_id === cursorEventId);
  return index < 0 ? events : events.slice(index + 1);
}

function sortEvents(events: readonly RunEventType[]): RunEventType[] {
  return [...events].sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.event_id.localeCompare(right.event_id));
}

function envelopeFor(event: RunEventType, events?: readonly RunEventType[], sequence?: number): RunEventEnvelope {
  const computedSequence = sequence ?? (events?.findIndex((item) => item.event_id === event.event_id) ?? -1) + 1;
  return RunEventEnvelope.parse({
    event_id: event.event_id,
    run_id: event.run_id,
    sequence: Math.max(1, computedSequence),
    timestamp: event.timestamp,
    runtime: "local_dev",
    event,
  });
}

function limitEnvelopes(events: readonly RunEventEnvelope[], limit: number | undefined): readonly RunEventEnvelope[] {
  if (limit === undefined) return events;
  return events.slice(0, Math.max(0, limit));
}
