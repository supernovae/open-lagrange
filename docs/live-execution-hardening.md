# Live Execution Hardening

This pass adds one real end-to-end workflow before adding more packs:

```bash
open-lagrange plan apply examples/planfiles/research-url-summary.plan.md --live
```

The command runs a local runtime execution path. It loads the validated Planfile
YAML block, resolves Research Pack capabilities through PackRegistry, executes
each node through CapabilityStepRunner, writes artifacts, records lineage, and
updates PlanState.

## What Is Live

- `research.fetch_source` performs an explicit live HTTP GET when the Planfile
  input sets `mode: live`.
- Network access goes through the SDK HTTP primitive.
- Source snapshot, source text, and exported Markdown artifacts are written to
  `.open-lagrange/plans/<plan_id>/artifacts/`.
- The central artifact index records producer pack, capability, plan, node,
  input artifact refs, validation status, redaction status, and `source_mode`.

## What Is Still Local Or Fixture-Backed

- `plan apply --live` uses the local runtime path in this phase, not distributed
  remote execution.
- Live search is not implemented; only explicit URL fetch is live.
- The summary is deterministic Markdown from extracted text, not model-authored.
- Browser automation and JavaScript execution are intentionally out of scope.

## Safety Boundaries

Live fetch does not bypass PackRegistry or policy gates. CapabilityStepRunner
verifies the registered capability digest, validates input and output schemas,
runs the policy gate, and normalizes errors. The SDK HTTP primitive rejects
non-HTTP(S) schemes, blocks localhost/private addresses by default, enforces
allowed methods, validates content types, applies timeouts, and enforces byte
limits.
