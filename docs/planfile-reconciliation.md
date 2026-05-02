# Planfile Reconciliation

Editable Planfiles use Markdown as the collaboration surface and the fenced executable Planfile block as the proposed execution state.

The reconciler:

1. Extracts exactly one fenced `yaml planfile` block containing `schema_version: open-lagrange.plan.v1`.
2. Ignores freeform Markdown and Mermaid for execution.
3. Parses the executable block into the Planfile schema.
4. Computes a canonical digest from executable structure only.
5. Produces a structured diff against the previous session Planfile when a session is present.
6. Runs Planfile validation and deterministic simulation.
7. Regenerates Mermaid and Markdown from the executable DAG.
8. Updates the Plan Builder session only if the edit is valid and safe.

Failed parse, invalid DAG, unknown capability references, fixture/mock misuse, and unsafe risk changes do not replace the current executable Planfile in the session.

## CLI

```sh
open-lagrange plan reconcile .open-lagrange/plans/example.plan.md
open-lagrange plan diff old.plan.md new.plan.md
open-lagrange plan builder update <session_id> --file edited.plan.md
open-lagrange plan builder edit <session_id>
open-lagrange plan builder import existing.plan.md
```

`plan builder edit` writes the current Planfile projection to `.open-lagrange/plan-builder/<session_id>/editable.plan.md`, opens `$EDITOR`, then reconciles the saved file.

## TUI

```text
/edit-plan
/edit-plan --web
/update-plan <path>
/import-plan <path>
/reconcile <path>
/plan-diff <old> <new>
```

The TUI writes or reads local Planfile Markdown and shows parse, diff, validation, simulation, artifact, and pending-question results in the transcript. `/edit-plan --web` returns a Plan Builder web URL for the active session so the browser page can be used as the full Markdown editor.

## Web

The Plan Builder page exposes an editable Planfile Markdown panel. “Reconcile Edits” calls the same core reconciler used by CLI and TUI, then displays:

- structured diff
- node-level additions, removals, and changed fields
- risk increases and approval changes
- validation errors
- simulation warnings
- pending questions
- regenerated Mermaid

Edited Planfiles are never run from the web page without validation.
