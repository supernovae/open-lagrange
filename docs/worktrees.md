# Repository Worktrees

Repository apply never mutates the caller's current worktree. It creates a git worktree under:

```text
.open-lagrange/worktrees/<plan_id>/
```

The branch name is deterministic:

```text
ol/<plan_id>
```

Each `WorktreeSession` records the repository root, worktree path, base ref, base commit, branch name, status, creation time, update time, and final patch artifact ID when available.

## Dirty Base

By default, apply refuses to start when the source worktree has uncommitted user changes:

```bash
open-lagrange repo apply .open-lagrange/plans/<plan_id>.plan.md
```

Use the explicit flag only when the caller owns that risk:

```bash
open-lagrange repo apply .open-lagrange/plans/<plan_id>.plan.md --allow-dirty-base
```

Open Lagrange internal files under `.open-lagrange/` are ignored for this dirty-base check so creating a Planfile does not block the matching apply.

## Retain And Cleanup

Failed and yielded runs retain the worktree by default for inspection. Remove it with:

```bash
open-lagrange repo cleanup <plan_id>
```

The cleanup command updates the durable `WorktreeSession` status to `cleaned`.

Inspect worktree state at any point:

```bash
open-lagrange repo worktree <plan_id_or_run_id>
```

The command prints the source repository root, isolated worktree path, branch,
base ref, base commit, retained/cleaned status, and cleanup command.
