# Plan Library

The Plan Library stores reusable Planfiles as plain local files.

Default libraries:

- workspace: `.open-lagrange/plans`
- personal: `~/.open-lagrange/plans`

Each library can include `open-lagrange-plans.yaml`:

```yaml
schema_version: open-lagrange.plan-library.v1
name: personal
description: Personal reusable Open Lagrange plans
plans:
  - path: research/daily-container-security.plan.md
    tags:
      - research
      - security
      - daily
```

## Commands

```bash
open-lagrange plan library list
open-lagrange plan library add team ./team-plans
open-lagrange plan library show team
open-lagrange plan library plans team
open-lagrange plan library remove team
open-lagrange plan save path/to/work.plan.md --library workspace --path research/work.plan.md
open-lagrange plan save-builder <session_id> --library workspace --path research/work.plan.md
```

`plan library sync` refreshes local discovery. Git-backed sync is not implemented yet. Use a local cloned directory and run git manually.

## Run From Library

```bash
open-lagrange plan check daily-brief --library workspace
open-lagrange plan run daily-brief --library workspace
```

Run creation always passes through Plan Check and opens the Durable Run surface.
