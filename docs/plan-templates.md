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

## Current Templates

`research.topic_brief` creates a cited Markdown brief from bounded provider-backed source discovery.

`research.url_summary` fetches one explicit URL and creates a cited Markdown summary.

`repository.plan_to_patch` creates a repository Planfile for patch work with inspection, design, patch preview, verification, review, and patch export steps.

## Pack Author Guidance

Templates should reference only real capabilities provided by installed packs. They should not reference fixture or mock behavior for live workflows. Inputs should be bounded and should make side effects visible in the rendered Planfile.
