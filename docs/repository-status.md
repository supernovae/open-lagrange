# Repository Status

`open-lagrange repo status <plan_id>` returns durable repository run status. For model-routed runs, status includes:

- `model_call_artifact_refs`
- `model_calls_summary`
- existing evidence, patch, verification, review, and final patch artifact refs

`model_calls_summary` aggregates calls by role and includes token/cost totals. Full model-call details stay in indexed artifacts:

```bash
open-lagrange repo model-calls <plan_id>
open-lagrange artifact show <model_call_artifact_id>
```

Deterministic planning creates no model-call artifacts. Model-with-fallback records failed model-call artifacts where a provider call was attempted, then records fallback state in repository status warnings.

