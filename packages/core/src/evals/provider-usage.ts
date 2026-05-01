import { z } from "zod";
import { estimateTokens } from "./benchmark-metrics.js";
import type { ModelRef } from "./model-route-config.js";

export const ModelUsageRecord = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  role_label: z.string().min(1),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  total_tokens: z.number().int().min(0),
  cached_input_tokens: z.number().int().min(0).optional(),
  reasoning_tokens: z.number().int().min(0).optional(),
  provider_reported_cost_usd: z.number().min(0).optional(),
  estimated_cost_usd: z.number().min(0).optional(),
  request_id: z.string().min(1).optional(),
  latency_ms: z.number().int().min(0),
  estimated: z.boolean(),
}).strict();

export const ModelUsageSummary = z.object({
  provider: z.string().min(1),
  models_used: z.array(z.string().min(1)),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  total_tokens: z.number().int().min(0),
  cached_input_tokens: z.number().int().min(0).optional(),
  reasoning_tokens: z.number().int().min(0).optional(),
  estimated_cost_usd: z.number().min(0).optional(),
  provider_reported_cost_usd: z.number().min(0).optional(),
  calls_by_role: z.record(z.string(), z.number().int().min(0)),
  estimated: z.boolean(),
}).strict();

export type ModelUsageRecord = z.infer<typeof ModelUsageRecord>;
export type ModelUsageSummary = z.infer<typeof ModelUsageSummary>;

export function createEstimatedUsageRecord(input: {
  readonly model_ref: ModelRef;
  readonly prompt: unknown;
  readonly output: unknown;
  readonly latency_ms: number;
}): ModelUsageRecord {
  const inputTokens = estimateTokens(input.prompt);
  const outputTokens = estimateTokens(input.output);
  return ModelUsageRecord.parse({
    provider: input.model_ref.provider,
    model: input.model_ref.model,
    role_label: input.model_ref.role_label,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    estimated_cost_usd: estimateCost(input.model_ref.model, inputTokens, outputTokens),
    latency_ms: input.latency_ms,
    estimated: true,
  });
}

export function usageRecordFromProvider(input: {
  readonly model_ref: ModelRef;
  readonly prompt: unknown;
  readonly output: unknown;
  readonly provider_result: unknown;
  readonly latency_ms: number;
}): ModelUsageRecord {
  const record = input.provider_result && typeof input.provider_result === "object" ? input.provider_result as Record<string, unknown> : {};
  const usage = typeof record.usage === "object" && record.usage ? record.usage as Record<string, unknown> : record;
  const inputTokens = numberField(usage.inputTokens) ?? numberField(usage.promptTokens) ?? numberField(usage.input_tokens);
  const outputTokens = numberField(usage.outputTokens) ?? numberField(usage.completionTokens) ?? numberField(usage.output_tokens);
  const totalTokens = numberField(usage.totalTokens) ?? numberField(usage.total_tokens);
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return createEstimatedUsageRecord({
      model_ref: input.model_ref,
      prompt: input.prompt,
      output: input.output,
      latency_ms: input.latency_ms,
    });
  }
  const normalizedInput = inputTokens ?? Math.max(0, (totalTokens ?? 0) - (outputTokens ?? 0));
  const normalizedOutput = outputTokens ?? Math.max(0, (totalTokens ?? 0) - normalizedInput);
  return ModelUsageRecord.parse({
    provider: input.model_ref.provider,
    model: input.model_ref.model,
    role_label: input.model_ref.role_label,
    input_tokens: normalizedInput,
    output_tokens: normalizedOutput,
    total_tokens: totalTokens ?? normalizedInput + normalizedOutput,
    ...(numberField(usage.cachedInputTokens) ?? numberField(usage.cached_input_tokens) ? { cached_input_tokens: numberField(usage.cachedInputTokens) ?? numberField(usage.cached_input_tokens) } : {}),
    ...(numberField(usage.reasoningTokens) ?? numberField(usage.reasoning_tokens) ? { reasoning_tokens: numberField(usage.reasoningTokens) ?? numberField(usage.reasoning_tokens) } : {}),
    estimated_cost_usd: estimateCost(input.model_ref.model, normalizedInput, normalizedOutput),
    ...(typeof record.requestId === "string" ? { request_id: record.requestId } : {}),
    latency_ms: input.latency_ms,
    estimated: false,
  });
}

export function summarizeModelUsage(records: readonly ModelUsageRecord[]): ModelUsageSummary {
  const inputTokens = sum(records.map((record) => record.input_tokens));
  const outputTokens = sum(records.map((record) => record.output_tokens));
  const cached = sum(records.map((record) => record.cached_input_tokens ?? 0));
  const reasoning = sum(records.map((record) => record.reasoning_tokens ?? 0));
  const providerCost = sum(records.map((record) => record.provider_reported_cost_usd ?? 0));
  const estimatedCost = sum(records.map((record) => record.estimated_cost_usd ?? 0));
  const callsByRole: Record<string, number> = {};
  for (const record of records) callsByRole[record.role_label] = (callsByRole[record.role_label] ?? 0) + 1;
  return ModelUsageSummary.parse({
    provider: records[0]?.provider ?? "unknown",
    models_used: [...new Set(records.map((record) => record.model))],
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    ...(cached > 0 ? { cached_input_tokens: cached } : {}),
    ...(reasoning > 0 ? { reasoning_tokens: reasoning } : {}),
    ...(estimatedCost > 0 ? { estimated_cost_usd: estimatedCost } : {}),
    ...(providerCost > 0 ? { provider_reported_cost_usd: providerCost } : {}),
    calls_by_role: callsByRole,
    estimated: records.some((record) => record.estimated),
  });
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number | undefined {
  const lower = model.toLowerCase();
  if (lower.includes("gpt-4o-mini")) return (inputTokens * 0.00000015) + (outputTokens * 0.0000006);
  if (lower.includes("gpt-4o")) return (inputTokens * 0.0000025) + (outputTokens * 0.00001);
  return undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
