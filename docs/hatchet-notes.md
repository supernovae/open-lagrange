# Hatchet Notes

Open Lagrange uses Hatchet as the durable workflow/task substrate because it is
MIT licensed and suitable for an OSS-compatible foundation.

Hatchet does not provide the same replay-journal semantics as the first
prototype runtime. Open Lagrange instead isolates non-deterministic and
side-effecting work as Hatchet-managed tasks:

- execution plan generation
- capability discovery
- cognitive artifact generation
- MCP endpoint execution
- critic evaluation
- approval request and decision records
- approval continuation context records
- status recording

LLM inference is isolated in a Hatchet-managed task with deterministic input,
idempotency metadata, retry policy, persisted run history, and schema
validation. Model output is treated as untrusted and must be reconciled before
any side effect occurs.

Open Lagrange also records typed status and approval snapshots in SQLite. The
storage boundary is shaped so a Postgres provider can be added for server or
Kubernetes deployments without changing CLI, web, or workflow callers.

Hatchet run IDs, worker names, retry policy, and continuation workflow names
are local implementation details..
