# SDK Primitives

SDK primitives are the safe building blocks that trusted Capability Pack
executors use inside the runtime. They are not model-facing capabilities and
they are not composed directly by Planfiles.

The boundary is:

- primitives provide bounded runtime services to pack executors
- capabilities expose workflow-facing APIs through PackRegistry
- Planfiles compose capabilities, not raw primitive authority
- models see capability snapshots, artifacts, policy reports, and approvals

## Available Primitives

- `http`: bounded HTTP(S) fetch, JSON fetch, and artifact capture
- `artifacts`: artifact write, metadata read, link, and lineage helpers
- `retry`: backoff with retry reports and `Retry-After` support
- `rateLimit`: rate-limit header parsing and retry-delay calculation
- `redaction`: headers, text, and object redaction
- `secrets`: resolve `SecretRef` values through the configured secret manager
- `approval`: create approval requests for risky work
- `policy`: produce policy decision reports for network, side effects, and capability use

## Primitive Context

Every primitive receives a `PrimitiveContext`. The context carries:

- pack and capability identity
- plan, node, task, trace, and idempotency identifiers when available
- policy context
- artifact store
- secret manager
- approval store
- logger
- redactor
- resource limits
- optional abort signal and fetch implementation

This keeps primitive authority explicit. Primitives do not depend on ambient
globals for secrets, policy, or artifact writes.

Generated pack scaffolds create this context from `PackExecutionContext`:

```ts
import { artifacts, createPrimitiveContext } from "@open-lagrange/capability-sdk/primitives";

const primitives = createPrimitiveContext(context, {
  pack_id: "local.example",
  capability_id: "local.example.summarize",
});

await artifacts.write(primitives, {
  artifact_id: "summary_1",
  kind: "summary",
  summary: "Created summary",
  content: output,
  validation_status: "pass",
  redaction_status: "redacted",
});
```

## Generated Packs

Generated pack scaffolds import primitives from
`@open-lagrange/capability-sdk/primitives`. Static validation warns when
generated capability code does not use SDK primitives, and rejects obvious raw
authority patterns such as raw `fetch`, `process.env`, child process APIs, or
direct filesystem/network module imports.

Generated code remains reviewable source. It is not installed automatically and
must pass validation before runtime activation can load it.
