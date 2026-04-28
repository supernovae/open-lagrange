# Planfiles

Planfiles are durable Markdown projections for typed work. They are meant to be read, reviewed, edited, and shared, but the control plane does not execute freeform Markdown.

## Execution Truth

A Planfile has three layers:

1. Markdown prose for collaboration.
2. A fenced executable YAML block with `schema_version: open-lagrange.plan.v1`.
3. Validated plan state recorded by the control plane.

The executable YAML block is the only proposed executable content in the Markdown file. The control plane parses that block, validates it, computes a canonical digest, and stores validated state before execution. Markdown prose can disagree with YAML; when that happens, YAML is treated as the proposal and a fresh Markdown projection is rendered from the validated plan.

Mermaid is only visualization. It is generated from the executable DAG and is never parsed back into execution state.

## Local Commands

```sh
open-lagrange plan create --goal "Update project docs" --dry-run --out plan.md
open-lagrange plan show plan.md
open-lagrange plan validate plan.md
open-lagrange plan graph plan.md
open-lagrange plan render plan.md --out plan.rendered.md
```

These commands do not require the runtime to be up.

## Runtime Commands

```sh
open-lagrange plan apply plan.md
open-lagrange plan status <plan_id>
open-lagrange plan resume <plan_id>
open-lagrange plan approve <plan_id> --reason "Reviewed"
open-lagrange plan reject <plan_id> --reason "Too broad"
```

Runtime commands re-validate the Planfile, compute a canonical digest, bind capability snapshots, enforce policy, and record state before execution or approval actions.

## Tamper Detection

Every validated plan has a canonical digest derived from normalized executable plan content. Approval and execution paths compare against that digest so a local file edit between review and execution is detected before work continues.
