# Plan Templates

Plan templates describe reusable workflow shapes supplied by trusted packs.

A template defines:

- Template ID, pack ID, title, and description.
- Supported domains and intent patterns.
- Required and optional capabilities.
- Parameters.
- Node templates.
- Output kind.
- Whether schedule metadata is supported.

Templates let users avoid knowing capability names or DAG structure while still producing explicit Planfiles.

## Instantiation

Parameterized Planfiles can be rendered locally:

```bash
open-lagrange plan instantiate templates/brief.plan.md \
  --param topic="open source container security" \
  --param max_sources=8 \
  --write .open-lagrange/plans/container-security.plan.md
```

Template replacement supports `${key}` and `{{key}}` placeholders. The result should be checked before running:

```bash
open-lagrange plan check .open-lagrange/plans/container-security.plan.md
```

## Current Templates

`research.topic_brief` creates a cited Markdown brief from bounded provider-backed source discovery.

`research.url_summary` fetches one explicit URL and creates a cited Markdown summary.

`repository.plan_to_patch` creates a repository Planfile for patch work with inspection, design, patch preview, verification, review, and patch export steps.

## Pack Author Guidance

Templates should reference only real capabilities provided by installed packs. Inputs should be bounded and should make side effects visible in the rendered Planfile.
