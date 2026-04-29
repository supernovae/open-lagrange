import { getSecretManager, secretRef, type SecretAccessContext, type SecretRef, type SecretRefMetadata } from "@open-lagrange/core/secrets";
import { loadConfig, saveConfig } from "./config.js";
import { activeModelProviderKey, activeModelProviderProfile } from "./model-providers.js";
import { getCurrentProfile } from "./profiles.js";
import type { RuntimeProfile, ServiceStatus } from "./types.js";

export function secretContext(profile: RuntimeProfile, purpose: string): SecretAccessContext {
  return {
    principal_id: "human-local",
    delegate_id: "open-lagrange-runtime",
    profile_name: profile.name,
    purpose,
    trace_id: `secret-${profile.name}-${purpose}`,
  };
}

export function profileSecretRef(profile: RuntimeProfile, name: string): SecretRef {
  const existing = profile.secretRefs?.[name];
  if (existing) return existing;
  return secretRef({
    provider: "os-keychain",
    name: secretStoreName(name),
    scope: "profile",
    profile_name: profile.name,
    description: `${name} secret for ${profile.name}.`,
  });
}

export async function setCurrentProfileSecret(input: {
  readonly name: string;
  readonly value: string;
  readonly provider?: SecretRef["provider"];
}): Promise<SecretRefMetadata> {
  const config = await loadConfig();
  const profile = config.profiles[config.currentProfile];
  if (!profile) throw new Error(`Current profile not found: ${config.currentProfile}`);
  const existing = profile.secretRefs?.[input.name];
  const ref = existing ?? secretRef({
    provider: input.provider ?? "os-keychain",
    name: secretStoreName(input.name),
    scope: "profile",
    profile_name: profile.name,
    description: `${input.name} secret for ${profile.name}.`,
  });
  await getSecretManager().setSecret(ref, input.value, secretContext(profile, "secret_write"));
  const nextProfile = {
    ...profile,
    ...(input.name === "open_lagrange_token" ? { auth: { ...(profile.auth ?? { type: "token" as const }), type: "token" as const, tokenRef: ref } } : {}),
    secretRefs: { ...(profile.secretRefs ?? {}), [input.name]: { ...ref, updated_at: new Date().toISOString() } },
  };
  await saveConfig({ ...config, profiles: { ...config.profiles, [profile.name]: nextProfile } });
  return getSecretManager().describeSecret(nextProfile.secretRefs[input.name] ?? ref, secretContext(nextProfile, "cli_status"));
}

export async function deleteCurrentProfileSecret(name: string): Promise<SecretRefMetadata> {
  const config = await loadConfig();
  const profile = config.profiles[config.currentProfile];
  if (!profile) throw new Error(`Current profile not found: ${config.currentProfile}`);
  const ref = profile.secretRefs?.[name] ?? profileSecretRef(profile, name);
  await getSecretManager().deleteSecret(ref, secretContext(profile, "secret_delete"));
  const { [name]: _removed, ...secretRefs } = profile.secretRefs ?? {};
  const nextProfile = { ...profile, secretRefs };
  await saveConfig({ ...config, profiles: { ...config.profiles, [profile.name]: nextProfile } });
  return { ...ref, configured: false, redacted: "********" };
}

export async function listCurrentProfileSecrets(): Promise<readonly SecretRefMetadata[]> {
  const profile = await getCurrentProfile();
  const context = secretContext(profile, "cli_status");
  return Promise.all(Object.values(profile.secretRefs ?? {}).map((ref) => getSecretManager().describeSecret(ref, context)));
}

export async function describeCurrentProfileSecret(name: string): Promise<SecretRefMetadata> {
  const profile = await getCurrentProfile();
  return getSecretManager().describeSecret(profileSecretRef(profile, name), secretContext(profile, "cli_status"));
}

export async function resolveProfileSecretValue(profile: RuntimeProfile, name: string, purpose: string): Promise<string | undefined> {
  const ref = profile.secretRefs?.[name];
  if (!ref) return undefined;
  try {
    const value = await getSecretManager().resolveSecret(ref, secretContext(profile, purpose));
    return value.value;
  } catch {
    return undefined;
  }
}

export async function resolveProfileAuthToken(profile: RuntimeProfile): Promise<string | undefined> {
  if (profile.auth?.type !== "token") return undefined;
  if (profile.auth.tokenRef) {
    try {
      return (await getSecretManager().resolveSecret(profile.auth.tokenRef, secretContext(profile, "runtime_auth"))).value;
    } catch {
      return undefined;
    }
  }
  return profile.auth.tokenEnv ? process.env[profile.auth.tokenEnv] : undefined;
}

export async function credentialStatuses(profile: RuntimeProfile): Promise<{
  readonly modelProvider: ServiceStatus;
  readonly remoteAuth: ServiceStatus;
  readonly secretProvider: string;
}> {
  const activeProvider = activeModelProviderKey(profile);
  const providerConfig = activeModelProviderProfile(profile);
  const providerRefKey = providerConfig.api_key_secret_ref;
  const providerRef = providerRefKey ? profile.secretRefs?.[providerRefKey] : undefined;
  const modelConfigured = Boolean(process.env.OPEN_LAGRANGE_MODEL_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY)
    || Boolean(providerRef && await getSecretManager().hasSecret(providerRef, secretContext(profile, "status")));
  const tokenRef = profile.auth?.tokenRef ?? profile.secretRefs?.open_lagrange_token;
  const authConfigured = profile.auth?.type === "none"
    || Boolean(profile.auth?.tokenEnv && process.env[profile.auth.tokenEnv])
    || Boolean(tokenRef && await getSecretManager().hasSecret(tokenRef, secretContext(profile, "status")));
  return {
    modelProvider: { name: "model", state: modelConfigured ? "running" : "not_configured", detail: providerRef?.provider ?? activeProvider },
    remoteAuth: { name: "remote-auth", state: authConfigured ? "running" : "not_configured", detail: tokenRef?.provider ?? profile.auth?.tokenEnv ?? "none" },
    secretProvider: providerRef?.provider ?? tokenRef?.provider ?? "env",
  };
}

function secretStoreName(name: string): string {
  if (name === "openai") return "openai-api-key";
  if (name === "open_lagrange_token") return "api-token";
  return name;
}
