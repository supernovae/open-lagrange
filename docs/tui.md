# Terminal Reconciliation Cockpit

The Open Lagrange TUI is an Ink-based terminal interface for watching and
steering reconciliation work. It renders state from the shared workflow client;
it does not own workflow state or bypass policy gates.

## Start The TUI

Start Hatchet and the worker first:

```bash
hatchet server start
npm run dev:worker
```

Launch a new repository run:

```bash
npm run dev:tui -- \
  --repo . \
  --goal "Add --json output to the CLI status command." \
  --dry-run
```

Attach to an existing project:

```bash
npm run dev:tui -- --project-id <project-id>
```

If no project or goal is provided, the TUI opens with an input lane. Plain text
starts a new goal when no project is active.

## Layout

The screen is split into a status bar, sidebar, main detail area, and input
bar.

- Status bar: profile, API health, worker health, Hatchet health, registered
  pack count, and model configuration.
- Sidebar: goal, project status, phase, active task, approval count, changed
  files, and safety boundaries.
- Main detail area: conversation, timeline, task list, approvals, diff,
  verification, review report, generated pack builder, artifact JSON, or help.
- Input bar: controlled command and intent lane.

## Keyboard Shortcuts

- `tab`: cycle pane
- `esc`: help
- `ctrl+r`: refresh
- `ctrl+s`: start local runtime
- `ctrl+d`: run doctor
- `ctrl+l`: show logs
- `ctrl+p`: prepare profile command
- `ctrl+q`: quit

## Slash Commands

- `/help`
- `/status`
- `/diff`
- `/verify`
- `/review`
- `/pack`
- `/json`
- `/approve <reason>`
- `/reject <reason>`
- `/scope allow <path>`
- `/scope deny <path>`
- `/run <goal>`
- `/attach <project_id>`
- `/quit`

Non-slash text is converted into a typed user frame event. With no active
project it becomes `submit_goal`. In an active project, text starting with
`why`, `what`, or `explain` becomes `ask_explanation`; other text becomes
`refine_goal`.

`refine_goal` and `/scope` currently record durable observations against the
project so the next reconciliation run can account for the user's frame. They
do not mutate an already validated capability intent. `ask_explanation` reads
the typed status surfaces and returns a deterministic explanation from current
project, task, approval, and error state.

`/verify <command_id>` starts a Hatchet-managed repository verification request
when the active task has repository status. The workflow reloads the repository
workspace, rediscovers the repository capability snapshot, runs only the
allowlisted command ID through the Repository Task Pack, and records the updated
verification result.

## Approval

Approval is explicit. When a task requires approval, the sidebar shows the
count and the approvals pane shows the request ID, task ID, requested
capability, risk level, and prompt.

Press `a` or enter `/approve <reason>` to approve the selected request. Press
`x` or enter `/reject <reason>` to reject it. Both actions go through the
shared workflow client and approval store. Approval allows a previously
validated intent to continue; it does not change the intent, arguments, digest,
or delegated authority.

## Why Chat Is Controlled

The input lane captures intent. It does not call the model directly and does
not execute capabilities. Every input is parsed into a typed user frame event
and sent through the same shared client used by the CLI and web interface.

The backend reconciler owns execution. Capability Packs provide bounded skills.
Policy gates define trust. The TUI renders the conversation, durable timeline,
approval queue, artifacts, diffs, verification results, and review reports in
separate panes so execution records are not hidden inside a transcript.
