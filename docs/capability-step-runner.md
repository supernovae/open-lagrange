# Capability Step Runner

`runCapabilityStep` is the generic runtime wrapper for executing one registered
capability as a Planfile step.

## Contract

Input includes `step_id`, `plan_id`, `node_id`, `capability_ref`,
`capability_digest`, typed `input`, `delegation_context`, `idempotency_key`,
`input_artifact_refs`, `dry_run`, and `trace_id`.

Result status is one of `success`, `failed`, `yielded`, or
`requires_approval`. Results include output, artifact refs, policy report,
observations, structured errors, duration, start time, and completion time.

## Execution Order

1. Resolve the capability through PackRegistry.
2. Verify the descriptor digest.
3. Validate input against the capability input schema.
4. Run the policy gate.
5. Return `requires_approval` or `yielded` when policy requires it.
6. Execute through PackRegistry.
7. Validate output against the capability output schema.
8. Record artifact lineage for produced artifacts.
9. Normalize thrown and returned errors.
10. Return a structured CapabilityStepResult.

PlanRunner maps step `success` to node `completed` in PlanState.
