# Editable Planfiles

Planfile Markdown contains explanatory prose, a Mermaid graph, and one executable YAML block.

Only the executable YAML block is authoritative.

## Workflow

```bash
open-lagrange plan compose "research open source container security" --write
$EDITOR .open-lagrange/plans/<plan_id>.plan.md
open-lagrange plan validate .open-lagrange/plans/<plan_id>.plan.md
open-lagrange plan graph .open-lagrange/plans/<plan_id>.plan.md
open-lagrange plan apply .open-lagrange/plans/<plan_id>.plan.md
```

Use `plan render` to regenerate prose and Mermaid from the structured Planfile.

```bash
open-lagrange plan render .open-lagrange/plans/<plan_id>.plan.md --out .open-lagrange/plans/<plan_id>.plan.md
```

Validation catches unknown capabilities, invalid DAG edges, fixture/mock misuse, and missing approval requirements.

## Reconciliation

Editable Planfiles are reconciled through the Plan Builder before they can become execution truth.

Markdown prose is collaborative context. The executable YAML block is the proposed plan. The validated PlanBuilderSession state is what the runtime can execute.

Rules:

- exactly one executable `yaml planfile` block is allowed
- freeform Markdown is never executed
- Mermaid is never parsed as execution state
- Mermaid is regenerated from the executable DAG
- invalid edits do not replace the current session Planfile
- risk increases, new capabilities, and schedule changes require explicit confirmation

Use:

```sh
open-lagrange plan builder edit <session_id>
open-lagrange plan builder update <session_id> --file edited.plan.md
open-lagrange plan reconcile edited.plan.md
open-lagrange plan diff old.plan.md edited.plan.md
```
