# TUI Run Console

The TUI Run Console uses the canonical Durable Run snapshot model. It does not execute plan nodes; it renders projections and sends resume, retry, cancel, and approval control requests.

Layout:

- Left pane: run frame and step list.
- Main pane: timeline or the selected run object.
- Detail pane: active node details, artifact counts, approvals, and errors.

Keyboard in run mode:

- `a` approvals
- `f` artifacts
- `m` model calls
- `l` logs
- `p` plan
- `r` resume or retry
- `e` explain
- `q` back

Slash commands:

- `/run status <run_id>`
- `/run events <run_id>`
- `/run explain <run_id>`
- `/run artifacts <run_id>`
- `/run resume <run_id>`
- `/run retry <run_id> <node_id> --mode reuse-artifacts|refresh-artifacts|force-new-idempotency-key`

The TUI switches to Run Console when a Durable Run is created or selected. Retry requires an explicit replay mode.
