# TUI Home

The TUI opens to Home, a chat-guided cockpit for discovering Open Lagrange flows without replacing the CLI.

Home shows:

- runtime status,
- installed pack health,
- starter flows,
- recent artifacts,
- pending approvals,
- chat input.

Plain text is treated as a proposal. The TUI classifies it, shows a suggested slash command, and requires `/confirm` before starting workflow work.

Examples:

```text
add json output to my cli
build a pack from skills.md
run the repo demo
what can you do?
```

Informational prompts can answer immediately. Workflow-starting prompts show a suggested flow first.

The TUI submits typed events to the control plane or uses CLI-equivalent local functions for local artifact actions. It does not own workflow state and does not bypass Planfiles, PackRegistry, policy gates, or approvals.
