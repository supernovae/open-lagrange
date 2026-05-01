# Model Call Telemetry

Repository model calls are runtime artifacts. Each persisted model-call artifact records:

- role
- provider and model
- route, plan, node, work order, and scenario IDs when available
- status
- schema validation status
- token usage and cost metadata
- latency
- redacted prompt artifact
- redacted response artifact
- input and output artifact refs

Inspect model calls:

```bash
open-lagrange repo model-calls <plan_id>
open-lagrange artifact show <model_call_artifact_id>
open-lagrange artifact show <redacted_prompt_artifact_id>
open-lagrange artifact show <redacted_response_artifact_id>
```

Prompt and response artifacts are redacted before indexing. Raw provider secrets, authorization headers, bearer tokens, credential-looking values, and home-directory paths are removed or replaced before storage.

Token and cost metadata is provider-reported when available. If the provider omits usage metadata, Open Lagrange stores estimated values and marks them as estimated.

