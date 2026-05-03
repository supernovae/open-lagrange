# Run Console

The Run Console is the shared execution view for web, TUI, and CLI.

Product flow:

- Plan Builder: compose, edit, validate, simulate, save.
- Run Console: run, observe, approve, inspect artifacts, retry/resume, export.

The console displays:

- run lifecycle and active plan
- active node and node status
- capability calls and policy decisions
- approvals
- model calls
- artifacts
- errors and yielded states
- next actions
- final outputs

Repository runs should surface evidence bundles, patch plans, patch artifacts, verification reports, repair attempts, review reports, and final patches.

Research runs should surface search results, source sets, fetched sources, extracted content, research briefs, citation indexes, and markdown exports.

Execution authority:

- Live runs are represented by durable Hatchet run metadata when Hatchet is configured.
- SQLite stores projection records, event history, node attempts, artifact metadata, and UI state.
- UI reads snapshots/events and sends actions. It does not own workflow state.

Retry/replay requires an explicit mode:

- `reuse-artifacts`
- `refresh-artifacts`
- `force-new-idempotency-key`

Run controls:

- Resume submits a durable continuation when the run yielded.
- Retry creates a node attempt and submits a replay continuation.
- Cancel records cancellation and emits run cancellation events.
