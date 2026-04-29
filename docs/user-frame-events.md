# User Frame Events

User Frame Events are the typed boundary between user input and Open Lagrange workflows.

The TUI accepts slash commands and natural-language chat, but both are normalized into typed events before anything runs.

Event families:

- `chat.message`
- `intent.classify`
- `plan.create`
- `plan.apply`
- `repo.run`
- `skill.frame`
- `skill.plan`
- `pack.build`
- `pack.inspect`
- `demo.run`
- `artifact.show`
- `approval.approve`
- `approval.reject`
- `doctor.run`
- `status.show`

Natural-language workflow starts require confirmation:

```text
user text
  -> SuggestedFlow
  -> /confirm
  -> typed User Frame Event
  -> control plane / local CLI-equivalent dispatcher
```

The event boundary keeps the TUI discoverable without making it the runtime.
