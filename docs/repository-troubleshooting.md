# Repository Troubleshooting

## Run Yielded

Use:

```bash
open-lagrange repo status <plan_id_or_run_id>
open-lagrange repo explain <plan_id_or_run_id>
```

The output lists next actions. Common reasons:

- scope expansion requires approval
- a model provider or credential is missing
- PatchPlan validation failed
- verification failed repeatedly

## Verification Failed

Inspect command summaries:

```bash
open-lagrange repo verify <plan_id_or_run_id>
```

Look for exit code, failing command ID, stderr excerpt, raw log artifact, and repair attempt count.

## Patch Missing

Check phases:

```bash
open-lagrange repo status <plan_id_or_run_id>
```

If the run has not reached final patch export, inspect the active phase and next actions.

## Worktree Cleanup

Cleanup never touches the caller's source worktree. It removes only the Open Lagrange-created worktree path:

```bash
open-lagrange repo cleanup <plan_id_or_run_id>
```
