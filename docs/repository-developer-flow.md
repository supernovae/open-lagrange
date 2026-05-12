# Repository Developer Flow

Repository work is Planfile-driven. The model may propose PatchPlans, but the control plane owns worktree creation, evidence collection, PatchPlan validation, patch application, verification, repair, approval, scope expansion, artifact lineage, and final patch export.

## Typical Flow

```bash
open-lagrange repo run --repo . --goal "add --json output to status" --apply
open-lagrange repo status <plan_id_or_run_id>
open-lagrange repo explain <plan_id_or_run_id>
open-lagrange repo diff <plan_id_or_run_id>
open-lagrange repo patch <plan_id_or_run_id> --output final.patch
open-lagrange repo cleanup <plan_id_or_run_id>
```

`repo explain` summarizes what was understood, what files were inspected, what changed, what verification ran, what failed or passed, and what to do next.

## Scope Expansion

If a run yields for scope expansion, inspect the request:

```bash
open-lagrange repo status <plan_id_or_run_id>
```

Then approve or reject:

```bash
open-lagrange repo scope approve <request_id> --reason "Allow reading status renderer"
open-lagrange repo scope reject <request_id> --reason "Keep task limited to CLI entry"
```

Resume after approval:

```bash
open-lagrange repo resume <plan_id>
```

## Cleanup

Repository apply uses an isolated worktree. Cleanup only removes the Open Lagrange-created worktree and updates its session status.
