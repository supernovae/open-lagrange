import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { getModelProviderDescriptor, normalizeModelProviderId } from "./model-provider-catalog.js";
import type { ModelProviderId, ModelSlotConfig } from "./model-provider-types.js";

export interface RuntimeModelProviderSettings {
  readonly provider?: string;
  readonly endpoint?: string;
  readonly api_key?: string;
  readonly models?: Partial<ModelSlotConfig>;
}

export type ModelRole = "default" | "high" | "coder";

export function createConfiguredLanguageModel(role: ModelRole = "default", settings: RuntimeModelProviderSettings = {}): LanguageModel | undefined {
  const providerId = runtimeProviderId(settings.provider);
  const descriptor = getModelProviderDescriptor(providerId);
  if (descriptor.compatibility === "native_adapter_required") return undefined;
  const endpoint = settings.endpoint ?? process.env.OPEN_LAGRANGE_MODEL_BASE_URL ?? descriptor.default_endpoint;
  if (!endpoint) return undefined;
  const apiKey = settings.api_key ?? runtimeApiKey(descriptor.api_key_env);
  if (descriptor.api_key_env && !apiKey && descriptor.compatibility !== "local_openai_compatible") return undefined;
  const model = modelForRole(role, settings.models ?? {}, descriptor.suggested_models);
  const provider = createOpenAI({
    name: descriptor.id,
    baseURL: endpoint,
    apiKey: apiKey ?? "open-lagrange-local",
  });
  return provider.chat(model);
}

export function hasConfiguredModelProvider(settings: RuntimeModelProviderSettings = {}): boolean {
  return Boolean(createConfiguredLanguageModel("default", settings));
}

export function modelForRole(role: ModelRole, configured: Partial<ModelSlotConfig>, suggested: ModelSlotConfig): string {
  if (role === "high") return configured.high ?? configured.default ?? suggested.high ?? suggested.default;
  if (role === "coder") return configured.coder ?? configured.high ?? configured.default ?? suggested.coder ?? suggested.high ?? suggested.default;
  return configured.default ?? suggested.default;
}

function runtimeProviderId(value: string | undefined): ModelProviderId {
  return normalizeModelProviderId(value ?? process.env.OPEN_LAGRANGE_MODEL_PROVIDER ?? "openai");
}

function runtimeApiKey(providerEnv: string | undefined): string | undefined {
  return process.env.OPEN_LAGRANGE_MODEL_API_KEY
    ?? (providerEnv ? process.env[providerEnv] : undefined)
    ?? process.env.OPENAI_API_KEY
    ?? process.env.AI_GATEWAY_API_KEY;
}
