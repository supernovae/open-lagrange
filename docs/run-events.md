# Run Events

Run events are the canonical execution log for Durable Runs. UI surfaces read this log through RunSnapshots instead of owning execution state.

Event types:

- `run.created`, `run.started`, `run.completed`, `run.failed`, `run.yielded`, `run.cancelled`
- `node.started`, `node.completed`, `node.failed`, `node.yielded`
- `capability.started`, `capability.completed`, `capability.failed`
- `policy.evaluated`
- `approval.requested`, `approval.resolved`
- `artifact.created`
- `model_call.completed`
- `verification.started`, `verification.completed`
- `repair.started`, `repair.completed`

Each stored event includes cursor metadata (`event_id`, `plan_id`) plus the canonical event fields for its `type`. Event details are top-level typed fields, not an opaque payload.

Storage:

- In-memory state stores events for tests and embedded local flows.
- SQLite stores events in `run_events` with indexes by `run_id` and timestamp.

Consumers should call `buildRunSnapshot` or the run API instead of replaying workflow details in a UI component.

Streaming:

- `GET /api/runs/:runId/stream` sends historical events after an optional cursor, then streams appended events.
- The stream also sends snapshot messages so clients can update without polling.
