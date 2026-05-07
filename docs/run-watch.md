# Run Watch

`run watch` tails live RunEvent envelopes for a Durable Run.

```bash
open-lagrange run watch <run_id>
open-lagrange run watch <run_id> --after <event_id>
open-lagrange run watch <run_id> --json
open-lagrange run watch <run_id> --follow
```

Behavior:

- Uses `GET /api/v1/runs/:runId/events/stream`.
- Reconnects with the last seen event cursor.
- Suppresses duplicate event IDs.
- Prints one line per event by default.
- Prints JSON envelopes with `--json`.
- Exits on `run.completed`, `run.failed`, `run.yielded`, or `run.cancelled` unless `--follow` is supplied.
- Falls back to replaying persisted events through `GET /api/v1/runs/:runId/events` after repeated stream failures.
