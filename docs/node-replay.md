# Node Replay

Retry and replay require an explicit mode.

Modes:

- `reuse_artifacts`: create a new NodeAttempt and continue from existing outputs without re-executing side-effecting work.
- `refresh_artifacts`: re-run read/fetch/extract-style work when policy allows.
- `force_new_idempotency_key`: intentionally re-execute with a new idempotency key and require approval for write or external side effects.

Every replay creates a NodeAttempt with an attempt number, replay mode, idempotency key, inputs, outputs, status, and timestamps. Retry without a mode returns a structured error that lists available modes.
