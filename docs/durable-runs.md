# Durable Runs

Durable Run is the canonical execution model for Planfile work.

A run records:

- the Planfile identity and digest
- runtime: `hatchet` or `local_dev`
- lifecycle status: `queued`, `running`, `requires_approval`, `yielded`, `failed`, `completed`, or `cancelled`
- active node, artifacts, approvals, model calls, errors, and node attempts

Hatchet owns durable execution when configured. The local state store is a query projection for CLI, TUI, web, and tests. When Hatchet is not configured, local development fallback may execute the run, but the run is clearly marked `local_dev`.

New surfaces should create, inspect, resume, retry, and cancel Durable Runs directly.
