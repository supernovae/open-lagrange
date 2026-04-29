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

If no project or goal is provided, the TUI opens to Home. Plain text is
classified into a suggested flow. Workflow-starting flows require `/confirm`.

## Layout

The screen is split into a status bar, sidebar, main detail area, and input
bar.

- Status bar: profile, API health, worker health, Hatchet health, registered
  pack count, and model configuration.
- Sidebar: goal, project status, phase, active task, approval count, changed
  files, and safety boundaries.
- Main detail area: home, conversation, timeline, task list, approvals, diff,
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
- `/doctor`
- `/capabilities`
- `/packs`
- `/demos`
- `/plan repo <goal>`
- `/repo run <goal>`
- `/skill frame <file>`
- `/skill plan <file>`
- `/pack build <file>`
- `/pack inspect <pack_id>`
- `/artifact list`
- `/artifact show <artifact_id>`
- `/approve <approval_id>`
- `/reject <approval_id>`
- `/confirm`
- `/quit`

Non-slash text is routed by the Chat Pack. Informational prompts answer
directly. Workflow-starting prompts produce a `SuggestedFlow` with a command
preview, side effects, and approval notes.

`/verify <command_id>` starts a Hatchet-managed repository verification request
when the active task has repository status. The workflow reloads the repository
workspace, rediscovers the repository capability snapshot, runs only the
allowlisted command ID through the Repository Task Pack, and records the updated
verification result.

## Approval

Approval is explicit. When a task requires approval, the sidebar shows the
count and the approvals pane shows the request ID, task ID, requested
capability, risk level, and prompt.

Enter `/approve <approval_id>` or `/reject <approval_id>`. Both actions go
through the shared workflow client and approval store. Approval allows a previously
validated intent to continue; it does not change the intent, arguments, digest,
or delegated authority.

## Why Chat Is Controlled

The input lane captures intent. It does not execute arbitrary capabilities.
Every input is parsed into a typed user frame event or a suggested flow. The TUI
uses local deterministic routing first and can add model-assisted routing for
ambiguous input only after redaction and validation.

The backend reconciler owns execution. Capability Packs provide bounded skills.
Policy gates define trust. The TUI renders the conversation, durable timeline,
approval queue, artifacts, diffs, verification results, and review reports in
separate panes so execution records are not hidden inside a transcript.
