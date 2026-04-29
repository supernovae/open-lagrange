import { ModelProviderDescriptor, ModelProviderId, type ModelProviderDescriptor as ModelProviderDescriptorType, type ModelProviderId as ModelProviderIdType } from "./model-provider-types.js";

const descriptors = [
  descriptor({
    id: "openai",
    display_name: "OpenAI",
    aliases: ["gpt"],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://api.openai.com/v1",
    api_key_env: "OPENAI_API_KEY",
    api_key_secret_ref: "openai",
    docs_url: "https://platform.openai.com/docs",
    suggested_models: { default: "gpt-4o-mini", high: "gpt-4o", coder: "gpt-4o" },
  }),
  descriptor({
    id: "anthropic",
    display_name: "Anthropic",
    aliases: ["claude"],
    compatibility: "native_adapter_required",
    endpoint_configurable: true,
    default_endpoint: "https://api.anthropic.com",
    api_key_env: "ANTHROPIC_API_KEY",
    api_key_secret_ref: "anthropic",
    docs_url: "https://docs.anthropic.com",
    suggested_models: { default: "claude-3-5-sonnet-latest", high: "claude-3-5-sonnet-latest", coder: "claude-3-5-sonnet-latest" },
    notes: ["Native provider adapter wiring is future work unless an OpenAI-compatible endpoint is supplied."],
  }),
  descriptor({
    id: "google",
    display_name: "Google Gemini",
    aliases: ["gemini"],
    compatibility: "native_adapter_required",
    endpoint_configurable: true,
    default_endpoint: "https://generativelanguage.googleapis.com/v1beta",
    api_key_env: "GOOGLE_GENERATIVE_AI_API_KEY",
    api_key_secret_ref: "google",
    docs_url: "https://ai.google.dev",
    suggested_models: { default: "gemini-1.5-pro", high: "gemini-1.5-pro", coder: "gemini-1.5-pro" },
    notes: ["Native provider adapter wiring is future work unless an OpenAI-compatible endpoint is supplied."],
  }),
  descriptor({
    id: "openrouter",
    display_name: "OpenRouter",
    aliases: [],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://openrouter.ai/api/v1",
    api_key_env: "OPENROUTER_API_KEY",
    api_key_secret_ref: "openrouter",
    docs_url: "https://openrouter.ai/docs",
    suggested_models: { default: "openai/gpt-4o-mini", high: "openai/gpt-4o", coder: "anthropic/claude-3.5-sonnet" },
  }),
  descriptor({
    id: "deepinfra",
    display_name: "DeepInfra",
    aliases: [],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://api.deepinfra.com/v1/openai",
    api_key_env: "DEEPINFRA_API_KEY",
    api_key_secret_ref: "deepinfra",
    docs_url: "https://deepinfra.com/docs",
    suggested_models: { default: "meta-llama/Meta-Llama-3.1-70B-Instruct", high: "meta-llama/Meta-Llama-3.1-405B-Instruct", coder: "Qwen/Qwen2.5-Coder-32B-Instruct" },
  }),
  descriptor({
    id: "groq",
    display_name: "Groq",
    aliases: [],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://api.groq.com/openai/v1",
    api_key_env: "GROQ_API_KEY",
    api_key_secret_ref: "groq",
    docs_url: "https://console.groq.com/docs",
    suggested_models: { default: "llama-3.3-70b-versatile", high: "llama-3.3-70b-versatile", coder: "qwen-2.5-coder-32b" },
  }),
  descriptor({
    id: "xai",
    display_name: "xAI Grok",
    aliases: ["grok"],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://api.x.ai/v1",
    api_key_env: "XAI_API_KEY",
    api_key_secret_ref: "xai",
    docs_url: "https://docs.x.ai",
    suggested_models: { default: "grok-2-latest", high: "grok-2-latest", coder: "grok-2-latest" },
  }),
  descriptor({
    id: "fireworks",
    display_name: "Fireworks AI",
    aliases: ["fireworks.ai"],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://api.fireworks.ai/inference/v1",
    api_key_env: "FIREWORKS_API_KEY",
    api_key_secret_ref: "fireworks",
    docs_url: "https://docs.fireworks.ai",
    suggested_models: { default: "accounts/fireworks/models/llama-v3p1-70b-instruct", high: "accounts/fireworks/models/llama-v3p1-405b-instruct", coder: "accounts/fireworks/models/qwen2p5-coder-32b-instruct" },
  }),
  descriptor({
    id: "mistral",
    display_name: "Mistral AI",
    aliases: ["mistral-ai"],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://api.mistral.ai/v1",
    api_key_env: "MISTRAL_API_KEY",
    api_key_secret_ref: "mistral",
    docs_url: "https://docs.mistral.ai",
    suggested_models: { default: "mistral-large-latest", high: "mistral-large-latest", coder: "codestral-latest" },
  }),
  descriptor({
    id: "together",
    display_name: "Together AI",
    aliases: ["together-ai", "toegther"],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://api.together.xyz/v1",
    api_key_env: "TOGETHER_API_KEY",
    api_key_secret_ref: "together",
    docs_url: "https://docs.together.ai",
    suggested_models: { default: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", high: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", coder: "Qwen/Qwen2.5-Coder-32B-Instruct" },
  }),
  descriptor({
    id: "azure_openai",
    display_name: "Azure OpenAI",
    aliases: ["azure", "azure-openai"],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    api_key_env: "AZURE_OPENAI_API_KEY",
    api_key_secret_ref: "azure_openai",
    docs_url: "https://learn.microsoft.com/azure/ai-services/openai",
    suggested_models: { default: "deployment-name", high: "deployment-name", coder: "deployment-name" },
    notes: ["Use your deployment endpoint and deployment name as the model value."],
  }),
  descriptor({
    id: "kimi",
    display_name: "Moonshot Kimi",
    aliases: ["moonshot", "moonshot-ai"],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://api.moonshot.ai/v1",
    api_key_env: "MOONSHOT_API_KEY",
    api_key_secret_ref: "kimi",
    docs_url: "https://platform.moonshot.ai/docs",
    suggested_models: { default: "moonshot-v1-32k", high: "moonshot-v1-128k", coder: "moonshot-v1-32k" },
  }),
  descriptor({
    id: "minimax",
    display_name: "MiniMax",
    aliases: [],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://api.minimax.io/v1",
    api_key_env: "MINIMAX_API_KEY",
    api_key_secret_ref: "minimax",
    docs_url: "https://www.minimax.io/platform/document",
    suggested_models: { default: "abab6.5s-chat", high: "abab6.5g-chat", coder: "abab6.5g-chat" },
  }),
  descriptor({
    id: "alibaba",
    display_name: "Alibaba Cloud Model Studio",
    aliases: ["qwen", "dashscope"],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    api_key_env: "DASHSCOPE_API_KEY",
    api_key_secret_ref: "alibaba",
    docs_url: "https://www.alibabacloud.com/help/en/model-studio",
    suggested_models: { default: "qwen-plus", high: "qwen-max", coder: "qwen-coder-plus" },
  }),
  descriptor({
    id: "cohere",
    display_name: "Cohere",
    aliases: [],
    compatibility: "native_adapter_required",
    endpoint_configurable: true,
    default_endpoint: "https://api.cohere.com",
    api_key_env: "COHERE_API_KEY",
    api_key_secret_ref: "cohere",
    docs_url: "https://docs.cohere.com",
    suggested_models: { default: "command-r-plus", high: "command-r-plus", coder: "command-r-plus" },
    notes: ["Native provider adapter wiring is future work unless an OpenAI-compatible endpoint is supplied."],
  }),
  descriptor({
    id: "perplexity",
    display_name: "Perplexity",
    aliases: [],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://api.perplexity.ai",
    api_key_env: "PERPLEXITY_API_KEY",
    api_key_secret_ref: "perplexity",
    docs_url: "https://docs.perplexity.ai",
    suggested_models: { default: "sonar-pro", high: "sonar-pro", coder: "sonar-pro" },
  }),
  descriptor({
    id: "cerebras",
    display_name: "Cerebras",
    aliases: [],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "https://api.cerebras.ai/v1",
    api_key_env: "CEREBRAS_API_KEY",
    api_key_secret_ref: "cerebras",
    docs_url: "https://inference-docs.cerebras.ai",
    suggested_models: { default: "llama3.1-70b", high: "llama3.1-70b", coder: "llama3.1-70b" },
  }),
  descriptor({
    id: "replicate",
    display_name: "Replicate",
    aliases: [],
    compatibility: "native_adapter_required",
    endpoint_configurable: true,
    default_endpoint: "https://api.replicate.com/v1",
    api_key_env: "REPLICATE_API_TOKEN",
    api_key_secret_ref: "replicate",
    docs_url: "https://replicate.com/docs",
    suggested_models: { default: "configure-model", high: "configure-model", coder: "configure-model" },
    notes: ["Native provider adapter wiring is future work unless an OpenAI-compatible endpoint is supplied."],
  }),
  descriptor({
    id: "mimo",
    display_name: "Mimo",
    aliases: [],
    compatibility: "openai_compatible",
    endpoint_configurable: true,
    api_key_env: "MIMO_API_KEY",
    api_key_secret_ref: "mimo",
    suggested_models: { default: "configure-model", high: "configure-model", coder: "configure-model" },
  }),
  descriptor({
    id: "ollama",
    display_name: "Ollama",
    aliases: [],
    compatibility: "local_openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "http://localhost:11434/v1",
    suggested_models: { default: "qwen2.5-coder:32b", high: "llama3.1:70b", coder: "qwen2.5-coder:32b" },
    notes: ["No API key is required by default."],
  }),
  descriptor({
    id: "lmstudio",
    display_name: "LM Studio",
    aliases: ["lm-studio"],
    compatibility: "local_openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "http://localhost:1234/v1",
    suggested_models: { default: "local-model", high: "local-model", coder: "local-model" },
    notes: ["No API key is required by default."],
  }),
  descriptor({
    id: "local",
    display_name: "Local OpenAI-compatible endpoint",
    aliases: ["local-api", "local_api"],
    compatibility: "local_openai_compatible",
    endpoint_configurable: true,
    default_endpoint: "http://localhost:11434/v1",
    api_key_secret_ref: "local_model",
    suggested_models: { default: "local-model", high: "local-model", coder: "local-model" },
    notes: ["Use any local OpenAI-compatible endpoint. API key is optional."],
  }),
];

export const MODEL_PROVIDER_CATALOG: Record<ModelProviderIdType, ModelProviderDescriptorType> = Object.fromEntries(descriptors.map((item) => [item.id, item])) as Record<ModelProviderIdType, ModelProviderDescriptorType>;

const aliases = new Map<string, ModelProviderIdType>();
for (const item of descriptors) {
  aliases.set(item.id, item.id);
  for (const alias of item.aliases) aliases.set(normalize(alias), item.id);
}

export function listModelProviderDescriptors(): readonly ModelProviderDescriptorType[] {
  return descriptors;
}

export function normalizeModelProviderId(value: string): ModelProviderIdType {
  const id = aliases.get(normalize(value));
  if (!id) throw new Error(`Unknown model provider: ${value}`);
  return id;
}

export function getModelProviderDescriptor(value: string): ModelProviderDescriptorType {
  return MODEL_PROVIDER_CATALOG[normalizeModelProviderId(value)];
}

export function modelProviderSecretName(value: string): string | undefined {
  const descriptor = getModelProviderDescriptor(value);
  return descriptor.api_key_secret_ref ? `${descriptor.api_key_secret_ref}-api-key` : undefined;
}

function descriptor(input: Omit<ModelProviderDescriptorType, "notes"> & { readonly notes?: readonly string[] }): ModelProviderDescriptorType {
  return ModelProviderDescriptor.parse({ notes: [], ...input });
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[.\s-]+/g, "_");
}
