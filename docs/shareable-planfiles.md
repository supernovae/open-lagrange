# Shareable Planfiles

Planfiles are Markdown documents with one executable `yaml planfile` block.
The prose and Mermaid graph are review surfaces; the YAML block is the execution truth.

A shareable Planfile should make requirements clear:

- required packs
- required providers
- required credentials
- permissions and approvals
- variables or parameters
- runtime profile expectations
- portability level

Use:

```bash
open-lagrange plan requirements path/to/work.plan.md
open-lagrange plan check path/to/work.plan.md
open-lagrange plan explain path/to/work.plan.md
open-lagrange plan save path/to/work.plan.md --library workspace --path team/work.plan.md
```

Portability levels:

- `portable`: no workspace, provider, credential, or machine-specific assumption.
- `workspace_bound`: requires a workspace or repository path.
- `profile_bound`: requires configured profile providers or credentials.
- `machine_bound`: embeds an absolute local path.

Before sharing a Planfile, run `plan check` and remove machine-specific paths when possible. A saved Planfile should not contain raw secrets; use credential references and profile/provider configuration.
