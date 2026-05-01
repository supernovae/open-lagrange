# Model-Routed Planning

Repository planning supports three modes:

```bash
open-lagrange repo plan --repo . --goal "add json output to my cli" --planning-mode deterministic
open-lagrange repo plan --repo . --goal "add json output to my cli" --planning-mode model
open-lagrange repo plan --repo . --goal "add json output to my cli" --planning-mode model-with-fallback
```

`deterministic` keeps the local template path. `model` routes GoalFrame and Planfile generation through the planner role. `model-with-fallback` records fallback telemetry and then uses the deterministic path if the provider is unavailable or generation fails.

Model-routed planning is schema-bound. The planner receives only the goal, user constraints, and a bounded repository metadata summary. It does not receive raw secrets, full repository contents, or unrelated transcripts. The generated Planfile is not executable until Planfile validation passes.

Live evals use model planning by default:

```bash
open-lagrange eval run repo-plan-to-patch --live-models --planning-mode model --yes
```

