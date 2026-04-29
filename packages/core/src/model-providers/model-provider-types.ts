import { z } from "zod";

export const ModelProviderId = z.enum([
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "deepinfra",
  "groq",
  "xai",
  "fireworks",
  "mistral",
  "together",
  "azure_openai",
  "kimi",
  "minimax",
  "alibaba",
  "cohere",
  "perplexity",
  "cerebras",
  "replicate",
  "mimo",
  "ollama",
  "lmstudio",
  "local",
]);

export const ModelProviderCompatibility = z.enum([
  "openai_compatible",
  "native_adapter_required",
  "local_openai_compatible",
]);

export const ModelSlotConfig = z.object({
  default: z.string().min(1),
  high: z.string().min(1).optional(),
  coder: z.string().min(1).optional(),
}).strict();

export const ModelProviderProfile = z.object({
  provider: ModelProviderId,
  endpoint: z.string().url().optional(),
  api_key_secret_ref: z.string().min(1).optional(),
  models: ModelSlotConfig,
}).strict();

export const ModelProviderDescriptor = z.object({
  id: ModelProviderId,
  display_name: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  compatibility: ModelProviderCompatibility,
  endpoint_configurable: z.boolean(),
  default_endpoint: z.string().url().optional(),
  api_key_env: z.string().min(1).optional(),
  api_key_secret_ref: z.string().min(1).optional(),
  docs_url: z.string().url().optional(),
  suggested_models: ModelSlotConfig,
  notes: z.array(z.string().min(1)).default([]),
}).strict();

export type ModelProviderId = z.infer<typeof ModelProviderId>;
export type ModelProviderCompatibility = z.infer<typeof ModelProviderCompatibility>;
export type ModelSlotConfig = z.infer<typeof ModelSlotConfig>;
export type ModelProviderProfile = z.infer<typeof ModelProviderProfile>;
export type ModelProviderDescriptor = z.infer<typeof ModelProviderDescriptor>;
