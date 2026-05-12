import { getModelProviderDescriptor, listModelProviderDescriptors, modelProviderSecretName, normalizeModelProviderId, modelForRole, type ModelProviderDescriptor, type ModelProviderId, type ModelProviderProfile, type ModelSlotConfig } from "@open-lagrange/core/model-providers";
import { getSecretManager, secretRef, type SecretAccessContext, type SecretRefMetadata } from "@open-lagrange/core/secrets";
import { loadConfig, saveConfig } from "./config.js";
import { getCurrentProfile } from "./profiles.js";
import type { RuntimeProfile } from "./types.js";

export interface ModelProviderStatus {
  readonly active: string;
  readonly provider: ModelProviderId;
  readonly display_name: string;
  readonly endpoint?: string;
  readonly compatibility: ModelProviderDescriptor["compatibility"];
  readonly models: ModelSlotConfig;
  readonly secret_ref?: string;
  readonly configured: boolean;
  readonly redacted: string;
  readonly notes: readonly string[];
}

export interface ConfigureModelProviderInput {
  readonly provider: string;
  readonly endpoint?: string;
  readonly model?: string;
  readonly high_model?: string;
  readonly coder_model?: string;
  readonly secret_ref?: string;
  readonly set_active?: boolean;
}

export function defaultModelProviderProfile(provider: string): ModelProviderProfile {
  const descriptor = getModelProviderDescriptor(provider);
  return {
    provider: descriptor.id,
    ...(descriptor.default_endpoint ? { endpoint: descriptor.default_endpoint } : {}),
    ...(descriptor.api_key_secret_ref ? { api_key_secret_ref: descriptor.api_key_secret_ref } : {}),
    models: descriptor.suggested_models,
  };
}

export function defaultActiveModelProvider(): string {
  return "openai";
}

export function listKnownModelProviders(): readonly ModelProviderDescriptor[] {
  return listModelProviderDescriptors();
}

export async function configureCurrentProfileModelProvider(input: ConfigureModelProviderInput): Promise<ModelProviderStatus> {
  const config = await loadConfig();
  const profile = config.profiles[config.currentProfile];
  if (!profile) throw new Error(`Current profile not found: ${config.currentProfile}`);
  const descriptor = getModelProviderDescriptor(input.provider);
  const key = descriptor.id;
  const existing = profile.modelProviders?.[key] ?? defaultModelProviderProfile(key);
  const secretRefKey = input.secret_ref ?? existing.api_key_secret_ref ?? descriptor.api_key_secret_ref;
  const nextProvider = {
    ...existing,
    ...(input.endpoint ? { endpoint: input.endpoint } : {}),
    ...(secretRefKey ? { api_key_secret_ref: secretRefKey } : {}),
    models: {
      default: input.model ?? existing.models.default,
      ...(input.high_model || existing.models.high ? { high: input.high_model ?? existing.models.high } : {}),
      ...(input.coder_model || existing.models.coder ? { coder: input.coder_model ?? existing.models.coder } : {}),
    },
  };
  const secretRefs = { ...(profile.secretRefs ?? {}) };
  if (secretRefKey && (descriptor.api_key_env || input.secret_ref) && !secretRefs[secretRefKey]) {
    secretRefs[secretRefKey] = secretRef({
      provider: "os-keychain",
      name: input.secret_ref ? `${secretRefKey}-api-key` : modelProviderSecretName(key) ?? `${secretRefKey}-api-key`,
      scope: "profile",
      profile_name: profile.name,
      description: `${descriptor.display_name} API key for model provider access.`,
    });
  }
  const nextProfile = {
    ...profile,
    activeModelProvider: input.set_active === false ? profile.activeModelProvider : key,
    modelProviders: { ...(profile.modelProviders ?? {}), [key]: nextProvider },
    secretRefs,
  };
  await saveConfig({ ...config, profiles: { ...config.profiles, [profile.name]: nextProfile } });
  return describeModelProvider(nextProfile, key);
}

export async function listCurrentProfileModelProviders(): Promise<readonly ModelProviderStatus[]> {
  const profile = await getCurrentProfile();
  const active = activeModelProviderKey(profile);
  const configured = profile.modelProviders ?? { [active]: defaultModelProviderProfile(active) };
  return Promise.all(Object.keys(configured).map((key) => describeModelProvider(profile, key)));
}

export async function describeCurrentProfileModelProvider(provider?: string): Promise<ModelProviderStatus> {
  const profile = await getCurrentProfile();
  return describeModelProvider(profile, provider ? normalizeModelProviderId(provider) : activeModelProviderKey(profile));
}

export function activeModelProviderKey(profile: RuntimeProfile): ModelProviderId {
  return normalizeModelProviderId(profile.activeModelProvider ?? process.env.OPEN_LAGRANGE_MODEL_PROVIDER ?? defaultActiveModelProvider());
}

export function activeModelProviderProfile(profile: RuntimeProfile): ModelProviderProfile {
  const active = activeModelProviderKey(profile);
  return profile.modelProviders?.[active] ?? defaultModelProviderProfile(active);
}

export async function modelProviderRuntimeEnv(profile: RuntimeProfile): Promise<Record<string, string>> {
  const active = activeModelProviderKey(profile);
  const provider = activeModelProviderProfile(profile);
  const descriptor = getModelProviderDescriptor(active);
  const secretKey = provider.api_key_secret_ref ?? descriptor.api_key_secret_ref;
  const secret = secretKey ? await resolveSecret(profile, secretKey) : undefined;
  const apiKey = secret ?? providerSpecificEnv(descriptor.api_key_env);
  const endpoint = provider.endpoint ?? descriptor.default_endpoint;
  const models = provider.models;
  return {
    OPEN_LAGRANGE_MODEL_PROVIDER: active,
    OPEN_LAGRANGE_MODEL: modelForRole("default", models, descriptor.suggested_models),
    OPEN_LAGRANGE_MODEL_HIGH: modelForRole("high", models, descriptor.suggested_models),
    OPEN_LAGRANGE_MODEL_CODER: modelForRole("coder", models, descriptor.suggested_models),
    ...(endpoint ? { OPEN_LAGRANGE_MODEL_BASE_URL: endpoint, OPENAI_BASE_URL: endpoint } : {}),
    ...(apiKey ? {
      OPEN_LAGRANGE_MODEL_API_KEY: apiKey,
      ...(descriptor.api_key_env ? { [descriptor.api_key_env]: apiKey } : {}),
      OPENAI_API_KEY: apiKey,
    } : {}),
  };
}

async function describeModelProvider(profile: RuntimeProfile, provider: string): Promise<ModelProviderStatus> {
  const key = normalizeModelProviderId(provider);
  const descriptor = getModelProviderDescriptor(key);
  const config = profile.modelProviders?.[key] ?? defaultModelProviderProfile(key);
  const secretRefKey = config.api_key_secret_ref ?? descriptor.api_key_secret_ref;
  const endpoint = config.endpoint ?? descriptor.default_endpoint;
  const configured = Boolean(
    descriptor.compatibility === "local_openai_compatible"
      || !descriptor.api_key_env
      || providerSpecificEnv(descriptor.api_key_env)
      || (secretRefKey && profile.secretRefs?.[secretRefKey]),
  );
  return {
    active: activeModelProviderKey(profile),
    provider: key,
    display_name: descriptor.display_name,
    ...(endpoint ? { endpoint } : {}),
    compatibility: descriptor.compatibility,
    models: config.models,
    ...(secretRefKey ? { secret_ref: secretRefKey } : {}),
    configured,
    redacted: configured ? "********" : "",
    notes: descriptor.notes,
  };
}

async function resolveSecret(profile: RuntimeProfile, key: string): Promise<string | undefined> {
  const ref = profile.secretRefs?.[key];
  if (!ref) return undefined;
  try {
    return (await getSecretManager().resolveSecret(ref, modelSecretContext(profile, "runtime_model_provider"))).value;
  } catch {
    return undefined;
  }
}

function modelSecretContext(profile: RuntimeProfile, purpose: string): SecretAccessContext {
  return {
    principal_id: "human-local",
    delegate_id: "open-lagrange-runtime",
    profile_name: profile.name,
    purpose,
    trace_id: `secret-${profile.name}-${purpose}`,
  };
}

function providerSpecificEnv(envName: string | undefined): string | undefined {
  return envName ? process.env[envName] : undefined;
}

export function modelProviderSecretMetadata(profile: RuntimeProfile, provider: string): SecretRefMetadata | undefined {
  const key = normalizeModelProviderId(provider);
  const descriptor = getModelProviderDescriptor(key);
  const refKey = profile.modelProviders?.[key]?.api_key_secret_ref ?? descriptor.api_key_secret_ref;
  const ref = refKey ? profile.secretRefs?.[refKey] : undefined;
  return ref ? { ...ref, configured: false, redacted: "********" } : undefined;
}
