# Plan Check

Plan Check is the readiness gate between a Planfile and a Durable Run.

It validates:

- Planfile schema and DAG shape
- referenced capabilities through PackRegistry snapshots when available
- required packs, providers, credentials, permissions, and runtime mode
- schedule requirements
- side effects and approval needs
- predicted artifact kinds
- portability warnings

Plan Check does not execute capabilities, fetch network content, mutate files, or read raw secret values. Credential checks use secret references only.

## Status

- `runnable`: the Planfile can create a Durable Run.
- `runnable_with_warnings`: the Planfile can run, but warnings, approvals, side effects, or portability constraints should be visible.
- `missing_requirements`: a required pack, provider, credential, permission, or runtime is missing.
- `invalid`: schema, DAG, capability reference, or validation errors block execution.
- `unsafe`: the Planfile requests an unsafe live execution shape, such as fixture/test-only modes in a live run or destructive work without an explicit approval path.

Blocking statuses do not create a run. Approval requirements can still create a run when the approval path is explicit, and the Run Console exposes the next action.

## CLI

```bash
open-lagrange plan check path/to/work.plan.md
open-lagrange plan explain path/to/work.plan.md
```

The report includes suggested actions such as provider setup, credential setup, approval, editing, or running.
