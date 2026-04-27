# Building a Capability Pack

1. Define a manifest with `pack_id`, version, runtime kind, trust level, scopes,
   policy metadata, and Open-COT alignment notes.
2. Define each capability with a stable `capability_id`, name, JSON-schema-like
   descriptor fields, Zod input/output schemas, risk level, side effect kind,
   idempotency mode, timeout, and examples.
3. Implement executors as pure functions of Pack Context plus validated input.
4. Register the pack explicitly in the static registry.
5. Add tests for digest stability, filtering, input validation, output
   validation, policy behavior, and Open-COT adapter preservation.

Do not load arbitrary package code from config. Do not start arbitrary MCP stdio
commands. If a pack needs process execution, expose exact allowlisted commands
as policy-gated capabilities.

