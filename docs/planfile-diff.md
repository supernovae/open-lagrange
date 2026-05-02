# Planfile Diff

Planfile diff compares executable Planfile structure, not rendered prose.

Diff output includes:

- nodes added, removed, or changed
- edges added or removed
- capabilities added or removed
- requirements changed for packs, providers, credentials, permissions, approvals, and runtime portability
- risk changes and whether risk increased
- approval changes
- schedule changes
- parameter changes

Mermaid edits are ignored. Mermaid is regenerated from the executable DAG after reconciliation.

Risk increases, new capabilities, and schedule changes are visible in the diff and require explicit confirmation flags in builder update flows.

The web Plan Builder renders these sections as separate cards. The TUI renders the same data as transcript lines so large diffs can be expanded with the existing transcript detail view.
