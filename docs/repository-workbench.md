# Repository Workbench

The Repository Workbench is the developer-facing view for repository Durable Runs. It projects `RepositoryPlanStatus`, RunSnapshots, and repository artifacts into phases a developer can inspect without reading raw artifact JSON.

## Start

```bash
open-lagrange repo run --repo . --goal "add --json output to status" --apply
```

The command prints repository status with the run handle, current phase, worktree, changed files, and next actions. Use the same ID with:

```bash
open-lagrange repo status <plan_id_or_run_id>
open-lagrange repo explain <plan_id_or_run_id>
open-lagrange repo evidence <plan_id_or_run_id>
open-lagrange repo diff <plan_id_or_run_id>
open-lagrange repo verify <plan_id_or_run_id>
open-lagrange repo worktree <plan_id_or_run_id>
```

## Phases

- Goal framed
- Worktree created
- Evidence collected
- Patch planned
- Patch validated
- Patch applied
- Verification run
- Repair attempted
- Review generated
- Final patch exported

Each phase links to artifact references and next actions where available.

## Web

Open:

```text
http://localhost:3000/runs/<run_id>/repository
```

The page shows the goal, worktree, phase list, evidence, PatchPlan operations, diff, verification, repair attempts, scope requests, review, final patch, model calls, and live state.

## TUI

Open the terminal workbench:

```bash
open-lagrange tui
```

Use `/repository` or `/repo run "goal"` from a repository context.

Keyboard hints in repository mode:

- `g` goal
- `e` evidence
- `p` plan
- `d` diff
- `v` verification
- `r` repair or retry
- `s` scope requests
- `m` model calls
- `f` final patch
- `x` cleanup
- `q` back
