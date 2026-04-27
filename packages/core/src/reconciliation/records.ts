import { deterministicObservationId } from "../ids/deterministic-ids.js";
import type { Observation, StructuredError, StructuredErrorCode } from "../schemas/open-cot.js";

export function structuredError(input: {
  readonly code: StructuredErrorCode;
  readonly message: string;
  readonly now: string;
  readonly intent_id?: string;
  readonly task_id?: string;
  readonly details?: Record<string, unknown>;
}): StructuredError {
  return {
    code: input.code,
    message: input.message,
    intent_id: input.intent_id,
    task_id: input.task_id,
    observed_at: input.now,
    details: input.details,
  };
}

export function observation(input: {
  readonly status: Observation["status"];
  readonly summary: string;
  readonly now: string;
  readonly intent_id?: string;
  readonly task_id?: string;
  readonly output?: unknown;
}): Observation {
  return {
    observation_id: deterministicObservationId(input),
    intent_id: input.intent_id,
    task_id: input.task_id,
    status: input.status,
    summary: input.summary,
    output: input.output,
    observed_at: input.now,
  };
}
