# Chat Pack

The Chat Pack is the default read-only helper pack for the TUI.

Capabilities:

- `chat.explain_system`
- `chat.list_capabilities`
- `chat.classify_intent`
- `chat.suggest_flow`
- `chat.explain_artifact`
- `chat.explain_error`
- `chat.summarize_status`
- `chat.generate_starter_plan`

The Chat Pack can read redacted runtime summaries, pack descriptors, demo metadata, artifact summaries, and approval counts.

It must not:

- execute arbitrary capabilities,
- mutate files,
- resolve or display raw secrets,
- bypass policy gates,
- bypass approvals,
- bypass the PackRegistry.

Intent routing is hybrid by design: deterministic local rules run first; model-assisted routing can be added for ambiguous input using only redacted summaries and validated `SuggestedFlow` output.
