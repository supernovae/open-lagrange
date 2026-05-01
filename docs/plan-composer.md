# Plan Composer

The Plan Composer maps an `IntentFrame` to a Planfile by preferring pack-provided templates.

For v1, core templates cover:

- `research.topic_brief`
- `research.url_summary`
- `repository.plan_to_patch`

If a strong template match exists, the composer fills template parameters, creates typed Planfile nodes, adds capability references, records approval requirements, and validates the result.

If no template matches, the composer may create a generic read-only Planfile only when ambiguity is not blocking.

## CLI

```bash
open-lagrange plan compose "research open source container security"
open-lagrange plan compose "summarize https://example.com"
open-lagrange plan compose "add JSON output to my CLI" --repo .
open-lagrange plan compose "research MCP security" --provider local-searxng --write
```

## Runtime Semantics

Composition is not execution. A composed Planfile must still validate before it can run. Write, verification, destructive, and external side-effect steps remain approval-gated.
