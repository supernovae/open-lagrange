import { RunEvent, type RunEvent as RunEventType } from "./run-event.js";

export interface RunEventStore {
  readonly appendRunEvent: (event: RunEventType) => Promise<RunEventType>;
  readonly listRunEvents: (runId: string) => Promise<readonly RunEventType[]>;
  readonly listRunEventsAfter: (runId: string, cursorEventId?: string) => Promise<readonly RunEventType[]>;
  readonly listRecentRunIds: (limit?: number) => Promise<readonly string[]>;
}

const runEvents = new Map<string, RunEventType[]>();
const subscribers = new Map<string, Set<(event: RunEventType) => void>>();

export const inMemoryRunEventStore: RunEventStore = {
  async appendRunEvent(event) {
    const parsed = RunEvent.parse(event);
    const events = runEvents.get(parsed.run_id) ?? [];
    if (!events.some((item) => item.event_id === parsed.event_id)) events.push(parsed);
    runEvents.set(parsed.run_id, events.sort((left, right) => left.timestamp.localeCompare(right.timestamp)));
    for (const subscriber of subscribers.get(parsed.run_id) ?? []) subscriber(parsed);
    return parsed;
  },
  async listRunEvents(runId) {
    return [...(runEvents.get(runId) ?? [])].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  },
  async listRunEventsAfter(runId, cursorEventId) {
    return eventsAfter(await this.listRunEvents(runId), cursorEventId);
  },
  async listRecentRunIds(limit = 20) {
    return [...runEvents.entries()]
      .map(([runId, events]) => ({ runId, timestamp: events.at(-1)?.timestamp ?? "" }))
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, limit)
      .map((item) => item.runId);
  },
};

export function subscribeRunEvents(runId: string, onEvent: (event: RunEventType) => void): () => void {
  const set = subscribers.get(runId) ?? new Set();
  set.add(onEvent);
  subscribers.set(runId, set);
  return () => {
    set.delete(onEvent);
    if (set.size === 0) subscribers.delete(runId);
  };
}

export function eventsAfter(events: readonly RunEventType[], cursorEventId?: string): readonly RunEventType[] {
  if (!cursorEventId) return events;
  const index = events.findIndex((event) => event.event_id === cursorEventId);
  return index < 0 ? events : events.slice(index + 1);
}
