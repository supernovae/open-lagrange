# Hatchet Notes

Open Lagrange uses Hatchet as the durable workflow/task substrate because it is
MIT licensed and suitable for an OSS-compatible foundation.

## Runtime Boundary

Every non-deterministic or side-effecting operation is represented as a
Hatchet-managed task:

- execution plan generation
- capability discovery
- cognitive artifact generation
- MCP endpoint execution
- critic evaluation
- approval request creation
- status recording

LLM inference is isolated in a Hatchet-managed task with deterministic input,
idempotency metadata, retry policy, persisted run history, and schema
validation. The model output is treated as untrusted and must be reconciled
before any side effect occurs.

## Current Durability Model

Hatchet stores workflow and task run history. Open Lagrange additionally records
typed status snapshots in an in-memory store for the first slice. That store is
not production durable and should be replaced with Postgres or another durable
store before production use.

## Open-COT Boundary

Hatchet run IDs, worker names, retry policy, and event configuration are local
Open Lagrange implementation details. Delegation context, execution plans,
capability snapshots, execution intents, observations, structured errors, and
reconciliation results are portable concepts and should stay aligned with
Open-COT.
