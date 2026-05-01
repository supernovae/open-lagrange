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
