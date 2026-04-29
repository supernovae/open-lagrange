import { z } from "zod";
import { ModelProviderProfile } from "@open-lagrange/core/model-providers";
import { SecretRef } from "@open-lagrange/core/secrets";

export const RuntimeMode = z.enum(["local", "remote"]);
export const RuntimeOwnership = z.enum(["managed-by-cli", "external"]);
export const RuntimeManagerKind = z.enum(["docker", "podman", "external"]);
export const AuthConfig = z.object({
  type: z.enum(["none", "token", "oidc"]),
  tokenEnv: z.string().min(1).optional(),
  tokenRef: SecretRef.optional(),
}).strict();

export const RuntimeProfile = z.object({
  name: z.string().min(1),
  mode: RuntimeMode,
  ownership: RuntimeOwnership,
  apiUrl: z.string().url(),
  hatchetUrl: z.string().url().optional(),
  workerUrl: z.string().url().optional(),
  webUrl: z.string().url().optional(),
  runtimeManager: RuntimeManagerKind.optional(),
  composeFile: z.string().min(1).optional(),
  auth: AuthConfig.optional(),
  secretRefs: z.record(z.string(), SecretRef).optional(),
  activeModelProvider: z.string().min(1).optional(),
  modelProviders: z.record(z.string(), ModelProviderProfile).optional(),
}).strict();

export const RuntimeConfig = z.object({
  currentProfile: z.string().min(1),
  profiles: z.record(z.string(), RuntimeProfile),
}).strict();

export const ServiceState = z.enum(["unknown", "not_configured", "starting", "running", "stopped", "unreachable", "error"]);
export const ServiceStatus = z.object({
  name: z.string().min(1),
  state: ServiceState,
  url: z.string().optional(),
  detail: z.string().optional(),
}).strict();

export const CredentialStatus = z.object({
  modelProvider: ServiceStatus,
  remoteAuth: ServiceStatus,
  secretProvider: z.string().min(1),
}).strict();

export const RuntimeStatus = z.object({
  profileName: z.string().min(1),
  mode: RuntimeMode,
  ownership: RuntimeOwnership,
  api: ServiceStatus,
  hatchet: ServiceStatus.optional(),
  worker: ServiceStatus.optional(),
  web: ServiceStatus.optional(),
  registeredPacks: z.array(z.string()).optional(),
  packHealth: z.array(z.unknown()).optional(),
  modelProvider: ServiceStatus.optional(),
  credentials: CredentialStatus.optional(),
  configPath: z.string().min(1),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
}).strict();

export interface ComposeRuntime {
  readonly kind: "docker" | "podman";
  readonly command: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface RuntimePaths {
  readonly homeDir: string;
  readonly configPath: string;
  readonly composePath: string;
  readonly statePath: string;
  readonly logsDir: string;
}

export interface ProfilePackPaths {
  readonly profileDir: string;
  readonly packsDir: string;
  readonly trustedLocalDir: string;
  readonly registryPath: string;
}

export type RuntimeMode = z.infer<typeof RuntimeMode>;
export type RuntimeOwnership = z.infer<typeof RuntimeOwnership>;
export type RuntimeManagerKind = z.infer<typeof RuntimeManagerKind>;
export type AuthConfig = z.infer<typeof AuthConfig>;
export type RuntimeProfile = z.infer<typeof RuntimeProfile>;
export type RuntimeConfig = z.infer<typeof RuntimeConfig>;
export type ServiceState = z.infer<typeof ServiceState>;
export type ServiceStatus = z.infer<typeof ServiceStatus>;
export type CredentialStatus = z.infer<typeof CredentialStatus>;
export type RuntimeStatus = z.infer<typeof RuntimeStatus>;
