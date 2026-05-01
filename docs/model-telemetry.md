# Model Telemetry

All model-routed repository roles use a shared role-call executor. Each call records:

- role
- provider and model
- route ID
- scenario, plan, and node IDs when available
- input, output, and total tokens
- cached and reasoning tokens when reported by the provider
- latency
- estimated or provider-reported cost
- call status
- redacted output artifact reference

Benchmark metrics aggregate usage by role:

| Role | Captured Work |
| --- | --- |
| planner | GoalFrame and Planfile generation |
| implementer | PatchPlan generation |
| repair | RepairPatchPlan generation |
| reviewer | ReviewReport generation |

Reports include per-route totals and per-role token/cost breakdowns so route choices can be tuned by measured success, validation failures, repair attempts, and cost.

Runtime repository runs also persist model calls as indexed artifacts. Use:

```bash
open-lagrange repo model-calls <plan_id>
open-lagrange artifact show <model_call_artifact_id>
```
