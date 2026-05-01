import { performance } from "node:perf_hooks";
import { generateObject } from "ai";
import type { z } from "zod";
import { createConfiguredLanguageModel } from "../model-providers/index.js";
import type { ModelRef } from "../evals/model-route-config.js";
import { usageRecordFromProvider, type ModelUsageRecord } from "../evals/provider-usage.js";
import { stableHash } from "../util/hash.js";
import type { ModelRoleLabel } from "./model-call-telemetry.js";

export class ModelRoleCallError extends Error {
  constructor(readonly code: "MODEL_PROVIDER_UNAVAILABLE" | "MODEL_ROLE_CALL_FAILED", message: string) {
    super(message);
    this.name = "ModelRoleCallError";
  }
}

export interface ModelRoleTraceContext {
  readonly route_id?: string;
  readonly scenario_id?: string;
  readonly plan_id?: string;
  readonly node_id?: string;
}

export interface ExecuteModelRoleCallInput<T> {
  readonly role: ModelRoleLabel;
  readonly model_ref: ModelRef;
  readonly schema: z.ZodType<T>;
  readonly system: string;
  readonly prompt: string;
  readonly trace_context?: ModelRoleTraceContext;
}

export interface ExecuteModelRoleCallResult<T> {
  readonly object: T;
  readonly usage_record: ModelUsageRecord;
}

export async function executeModelRoleCall<T>(input: ExecuteModelRoleCallInput<T>): Promise<ExecuteModelRoleCallResult<T>> {
  const model = createConfiguredLanguageModel("default", {
    provider: input.model_ref.provider,
    models: { default: input.model_ref.model },
  });
  if (!model) throw new ModelRoleCallError("MODEL_PROVIDER_UNAVAILABLE", `Model provider unavailable for ${input.role}.`);
  const started = performance.now();
  try {
    const result = await generateObject({
      model,
      schema: input.schema,
      system: input.system,
      prompt: input.prompt,
      ...(input.model_ref.temperature === undefined ? {} : { temperature: input.model_ref.temperature }),
      ...(input.model_ref.top_p === undefined ? {} : { topP: input.model_ref.top_p }),
      ...(input.model_ref.max_output_tokens === undefined ? {} : { maxOutputTokens: input.model_ref.max_output_tokens }),
    });
    const latency = Math.max(0, Math.round(performance.now() - started));
    const usage = usageRecordFromProvider({
      model_ref: input.model_ref,
      prompt: input.prompt,
      output: result.object,
      provider_result: result,
      latency_ms: latency,
      status: "completed",
      output_artifact_id: `model_call_${stableHash({
        role: input.role,
        route: input.trace_context?.route_id,
        plan: input.trace_context?.plan_id,
        node: input.trace_context?.node_id,
        output: result.object,
      }).slice(0, 18)}`,
      ...(input.trace_context ? { trace_context: input.trace_context } : {}),
    });
    return { object: result.object, usage_record: usage };
  } catch (caught) {
    if (caught instanceof ModelRoleCallError) throw caught;
    throw new ModelRoleCallError("MODEL_ROLE_CALL_FAILED", caught instanceof Error ? caught.message : String(caught));
  }
}
