# Primitive Security Model

Core runtime primitives exist so packs can do useful work without grabbing raw
process authority.

## Boundary

- primitives are for trusted pack executors
- capabilities are workflow-facing APIs
- Planfiles compose capabilities
- models receive capability snapshots, not primitive handles
- secrets are resolved by reference only
- risky side effects flow through policy and approval primitives

## Disallowed Raw Patterns

Generated pack validation rejects or flags:

- raw `fetch`
- direct `process.env` secret access
- child process APIs
- `eval` and dynamic function construction
- direct `fs`, `net`, `tls`, `http`, or `https` imports
- raw secret logging patterns
- network calls without declared hosts
- SDK HTTP calls without timeout and byte limits

Shell commands are not a default primitive. Packs that need process execution
must declare that need separately and require manual review.

## Artifact Lineage

The artifact primitive records:

- `produced_by_pack_id`
- `produced_by_capability_id`
- `produced_by_plan_id`
- `produced_by_node_id`
- `produced_by_task_id`
- `input_artifact_refs`
- `output_artifact_refs`
- validation status
- redaction status

This makes capability outputs inspectable without making the TUI, CLI, or model
own workflow state.

## Future Research Pack Shape

A future Research Pack should use:

- `http.fetchJson` or `http.downloadToArtifact` for source retrieval
- `retry.withBackoff` for transient upstream failures
- `rateLimit.fromHeaders` for provider rate-limit behavior
- `redaction.redactObject` before writing source metadata
- `artifacts.write` for citations and brief artifacts

It should not call raw network APIs, read secrets from environment variables, or
write files directly.
