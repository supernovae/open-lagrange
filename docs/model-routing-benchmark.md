# Model Routing Benchmark

The repository Plan-to-Patch benchmark compares PatchPlan routing configurations with deterministic fixture scenarios.

```bash
open-lagrange eval list
open-lagrange eval scenarios
open-lagrange eval routes
open-lagrange eval run repo-plan-to-patch --mock-models
open-lagrange eval run repo-plan-to-patch --live-models --yes --max-scenarios 1
open-lagrange eval report <run_id>
open-lagrange eval compare <run_id>
```

Configurations:

- deterministic preview only
- small model PatchPlan
- strong model PatchPlan
- small repair with strong escalation
- strong planning with small implementation

Metrics include success, patch validation, verification pass, validation failures, repair attempts, scope expansion requests, approvals required, input and output tokens, estimated cost, wall-clock time, capability calls, repeated actions, changed files, patch size, and review quality flags.

Mock mode uses fixture outputs and is deterministic. Live mode requires `--live-models`, `--yes`, and configured providers. Unit tests should use mock mode only.

Live mode creates isolated fixture repositories, applies repository Planfiles through `RepositoryPlanRunner`, captures PatchPlan validation, verification, repair, final patch, token, and cost metrics, then writes JSON, Markdown, and CSV reports under `.open-lagrange/evals/<run_id>/`.
