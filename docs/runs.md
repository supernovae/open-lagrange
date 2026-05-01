# Runs

Runs are the human-facing way to inspect local output.

Artifacts remain durable, addressable records, but a flat artifact list gets noisy quickly. The run index groups each workflow execution into primary outputs, supporting evidence, and debug material.

## Files

```text
.open-lagrange/runs/index.json
.open-lagrange/latest/run.json
.open-lagrange/latest/summary.md
```

Workflow-specific files still live under their output directory, for example:

```text
.open-lagrange/demos/repo-json-output/<run_id>/
```

## Commands

Start with the latest run:

```bash
open-lagrange run outputs latest
```

List runs:

```bash
open-lagrange run list
```

Show one run:

```bash
open-lagrange run show <run_id>
```

Show primary and supporting outputs:

```bash
open-lagrange run outputs <run_id> --include-supporting
```

Use the artifact archive when you need a specific item:

```bash
open-lagrange artifact recent
open-lagrange artifact show <artifact_id>
open-lagrange artifact export <artifact_id> --output ./output.patch
```

## TUI

The TUI supports:

```text
/run list
/run outputs latest
/artifact recent
/artifact show <artifact_id>
```

The default path should be run-first. Artifact IDs are still visible for export, lineage, and detailed review.
