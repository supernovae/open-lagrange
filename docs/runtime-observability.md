# Runtime Observability

Repository Plan-to-Patch runs write durable artifacts for evidence, PatchPlans, patch validation, verification, review, final patches, and model-call telemetry.

Model-call telemetry differs from eval-only metrics:

- eval metrics compare model routes across scenarios
- runtime model-call artifacts explain what happened in a specific repository plan/run
- status responses include summaries and artifact refs, not full prompt or response content
- prompt and response content is available only through redacted artifact records

Useful commands:

```bash
open-lagrange repo status <plan_id>
open-lagrange repo model-calls <plan_id>
open-lagrange artifact list
open-lagrange artifact show <artifact_id>
```

The TUI plan/run detail panes show model calls by role, provider/model, token and cost estimates, latency, failed calls, fallback use, and linked redacted artifacts.

