import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import YAML from "yaml";
import { getModelProviderDescriptor } from "@open-lagrange/core/model-providers";
import { secretRef } from "@open-lagrange/core/secrets";
import { RuntimeConfig, RuntimeProfile, type RuntimeConfig as RuntimeConfigType, type RuntimeProfile as RuntimeProfileType } from "./types.js";
import { getRuntimePaths } from "./paths.js";

export async function loadConfig(): Promise<RuntimeConfigType> {
  const paths = getRuntimePaths();
  const text = await readFile(paths.configPath, "utf8");
  return RuntimeConfig.parse(parseConfig(text));
}

export async function saveConfig(config: RuntimeConfigType): Promise<void> {
  const paths = getRuntimePaths();
  const parsed = RuntimeConfig.parse(config);
  await mkdir(dirname(paths.configPath), { recursive: true });
  await writeFile(paths.configPath, stringifyConfig(parsed), "utf8");
}

export async function configExists(): Promise<boolean> {
  try {
    await loadConfig();
    return true;
  } catch {
    return false;
  }
}

export function defaultLocalProfile(input: {
  readonly runtime: "docker" | "podman";
  readonly composeFile?: string;
}): RuntimeProfileType {
  return RuntimeProfile.parse({
    name: "local",
    mode: "local",
    ownership: "managed-by-cli",
    apiUrl: "http://localhost:4317",
    hatchetUrl: "http://localhost:8080",
    workerUrl: "http://localhost:4318/healthz",
    webUrl: "http://localhost:3000",
    runtimeManager: input.runtime,
    composeFile: input.composeFile ?? getRuntimePaths().composePath,
    auth: { type: "none" },
    secretRefs: defaultProfileSecretRefs("local"),
    activeModelProvider: "openai",
    modelProviders: {
      openai: defaultModelProviderProfile(),
    },
  });
}

function parseConfig(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return YAML.parse(text);
  }
}

function stringifyConfig(config: RuntimeConfigType): string {
  return YAML.stringify(config);
}

export function defaultProfileSecretRefs(profileName: string) {
  return {
    openai: secretRef({
      provider: "os-keychain",
      name: "openai-api-key",
      scope: "profile",
      profile_name: profileName,
      description: "OpenAI API key for local model provider access.",
    }),
    open_lagrange_token: secretRef({
      provider: "os-keychain",
      name: "api-token",
      scope: "profile",
      profile_name: profileName,
      description: "Open Lagrange API auth token for the profile.",
    }),
  };
}

function defaultModelProviderProfile() {
  const descriptor = getModelProviderDescriptor("openai");
  return {
    provider: descriptor.id,
    endpoint: descriptor.default_endpoint,
    api_key_secret_ref: descriptor.api_key_secret_ref,
    models: descriptor.suggested_models,
  };
}
