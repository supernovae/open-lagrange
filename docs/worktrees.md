# Repository Worktrees

Repository plan execution uses an isolated git worktree under:

```text
.open-lagrange/worktrees/<plan_id>
```

The branch name is deterministic:

```text
ol/<plan_id>
```

The source worktree is never modified directly during plan execution. Open Lagrange records the base ref and base commit, applies repository PatchPlans in the isolated worktree, and exports the final diff from that worktree.

## Dirty Base Handling

By default, repository apply refuses to start when the source worktree has uncommitted changes. This avoids exporting a patch against an unstable base. Use the explicit dirty-base flag only when the caller owns that risk:

```bash
open-lagrange repo apply <planfile> --allow-dirty-base
```

## Cleanup

Worktrees are retained by default so failed or yielded runs can be inspected. Remove a plan worktree with:

```bash
open-lagrange repo cleanup <plan_id>
```

## Patch Validation

The exported patch is checked against the recorded base before it is returned. A final patch artifact is not treated as merged work; it is a reviewable artifact for the caller to inspect, apply, or discard.
