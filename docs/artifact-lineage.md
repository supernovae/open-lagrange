# Artifact Lineage

Artifact summaries now carry optional lineage fields:

- `produced_by_pack_id`
- `produced_by_capability_id`
- `produced_by_plan_id`
- `produced_by_node_id`
- `input_artifact_refs`
- `output_artifact_refs`
- `validation_status`
- `redaction_status`

This lets the CLI, TUI, and web UI explain where an artifact came from without exposing raw secrets. For example, a smoke test artifact can point to the installed pack and capability that produced it.

```json
{
  "artifact_id": "pack_smoke_local_markdown_transformer",
  "kind": "pack_smoke_report",
  "produced_by_pack_id": "local.markdown-transformer",
  "produced_by_capability_id": "local.markdown-transformer.transform_markdown",
  "validation_status": "pass",
  "redaction_status": "redacted"
}
```
