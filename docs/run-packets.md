# Run Packets

A Run Packet is a Markdown report plus JSON manifest for the important artifacts in a run.

Packet types:

- `research`: topic, brief, sources, citations, source selection notes, and timeline summary.
- `developer`: goal, changed files, final patch, verification report, review report, model-call summary, and worktree info.
- `debug`: timeline, errors, warnings, policy reports, model-call summary, and artifact list.
- `general`: high-level run summary, final outputs, and artifact list.

Create one:

```bash
open-lagrange output packet --run <run_id> --type developer
```

The generated packet is itself an artifact and keeps input artifact refs for lineage.
