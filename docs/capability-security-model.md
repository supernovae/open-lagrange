# Capability Security Model

MCP-shaped descriptors describe protocol shape; they are not sufficient for
safety. Open Lagrange adds deterministic reconciliation boundaries around every
capability:

- Delegation Context identifies who delegated authority and what is allowed.
- Capability Snapshots freeze available capabilities and digests.
- Policy Gate authorizes execution separately from schema validation.
- Idempotency keys make side effects auditable and retry-aware.
- Approval continuation resumes only persisted, previously validated requests.
- Pack Context prevents ambient authority from leaking into executors.

Repository capabilities additionally enforce path normalization, repo root
jails, secret-file denial, byte limits, command allowlists, expected hashes, and
explicit apply or approval for writes.

