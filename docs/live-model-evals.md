# Live Model Evals

Live repository evals measure bounded model roles inside the control plane.

```bash
open-lagrange eval run repo-plan-to-patch --live-models --yes
open-lagrange eval run repo-plan-to-patch --live-models --yes --scenario cli-json-status --route strong-plan-small-implement
open-lagrange eval run repo-plan-to-patch --live-models --planning-mode model --yes --max-scenarios 1
```

Live mode is explicit because it may call configured providers and incur cost. If credentials are missing, the route is skipped with a structured status and remediation hint rather than failing CI.

Each run copies fixture content into an isolated repository, creates a Planfile, executes through `RepositoryPlanRunner`, validates PatchPlans, applies patches in the isolated worktree, runs allowlisted verification, exports a final patch, and evaluates scenario success criteria.

Live mode measures all configured route roles when authoritative apply is enabled:

- planner: GoalFrame and Planfile generation
- implementer: PatchPlan generation
- repair: RepairPatchPlan generation
- reviewer: ReviewReport generation

`--planning-mode model` fails or skips clearly when provider credentials are unavailable. `--planning-mode model-with-fallback` records fallback telemetry before using deterministic planning.

Provider usage records include exact token metadata when available. If provider metadata is unavailable, Open Lagrange estimates tokens from prompt and output size and marks the usage as estimated.
