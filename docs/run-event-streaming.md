# Run Event Streaming

RunEvent streaming is the live delivery channel for Durable Run projections. It is not execution authority; Hatchet owns durable execution when configured, and RunEvent/RunSnapshot remain query projections.

Canonical endpoint:

```text
GET /api/runs/:runId/events/stream
GET /api/v1/runs/:runId/events/stream
```

Resume cursors:

- `?after=<event_id>` replays events after a cursor.
- `Last-Event-ID: <event_id>` is also accepted.
- The query parameter wins when both are present.

Event frames:

```text
id: <event_id>
event: run.event
data: {"event_id":"...","run_id":"...","sequence":1,"timestamp":"...","runtime":"hatchet","event":{...}}
```

Heartbeat frames are SSE comments:

```text
: heartbeat 2026-05-07T00:00:00.000Z
```

Error frames:

```text
event: run.error
data: {"code":"RUN_EVENT_REPLAY_LIMIT_EXCEEDED","message":"...","retryable":true}
```

Reliability rules:

- The projection store persists events before broadcasting.
- Clients reconnect with the last seen `event_id`.
- If an API process restarts, clients replay persisted events from the cursor.
- Local in-process broadcast is best-effort across one API process; persisted replay is the recovery contract.
- Replay is capped to avoid huge dumps. On cap overflow, clients refetch RunSnapshot and reconnect from the latest cursor.

Safety rules:

- Streamed envelopes are redacted before serialization.
- Model-call events reference model-call artifacts.
- Raw secrets and raw unredacted model prompt/response bodies are not streamed.
