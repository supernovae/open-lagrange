import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { defaultLocalProfile, loadConfig, saveConfig } from "./config.js";
import { composeDown, composeFileExists, composeLogs, composeUp, detectRuntime, writeComposeTemplate } from "./compose.js";
import { modelProviderRuntimeEnv } from "./model-providers.js";
import { getProfilePackPaths, getRuntimePaths } from "./paths.js";
import { getCurrentProfile } from "./profiles.js";
import { credentialStatuses, resolveProfileAuthToken } from "./secrets.js";
import { RuntimeStatus, type RuntimeConfig, type RuntimeProfile, type RuntimeStatus as RuntimeStatusType, type ServiceStatus } from "./types.js";

interface DevState {
  readonly pids: Record<string, number>;
}

export async function initRuntime(input: { readonly runtime?: "docker" | "podman" } = {}): Promise<RuntimeConfig> {
  const paths = getRuntimePaths();
  await mkdir(paths.homeDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });
  const detected = await detectRuntime(input.runtime);
  const runtime = input.runtime ?? detected?.kind ?? "podman";
  await writeComposeTemplate(paths.composePath);
  const config = {
    currentProfile: "local",
    profiles: {
      local: defaultLocalProfile({ runtime, composeFile: paths.composePath }),
    },
  };
  await saveConfig(config);
  return config;
}

export async function startLocalRuntime(input: { readonly dev?: boolean; readonly runtime?: "docker" | "podman" } = {}): Promise<RuntimeStatusType> {
  const profile = await localProfile(input.runtime);
  if (profile.mode !== "local") return remoteRefusal(profile, "Remote profiles are externally managed and cannot be started locally.");
  if (profile.composeFile && !(await composeFileExists(profile.composeFile))) await writeComposeTemplate(profile.composeFile);
  const env = await runtimeEnv(profile);
  await composeUp(profile, input.dev ?? false, env);
  if (input.dev) await startDevProcesses(env);
  return ensureRuntimeReady();
}

export async function stopLocalRuntime(): Promise<RuntimeStatusType> {
  const profile = await getCurrentProfile();
  if (profile.mode !== "local") return remoteRefusal(profile, "Remote profiles are externally managed and cannot be stopped locally.");
  await stopDevProcesses();
  await composeDown(profile);
  return getRuntimeStatus();
}

export async function restartLocalRuntime(input: { readonly dev?: boolean; readonly runtime?: "docker" | "podman" } = {}): Promise<RuntimeStatusType> {
  await stopLocalRuntime();
  return startLocalRuntime(input);
}

export async function tailLogs(service?: string): Promise<string> {
  const profile = await getCurrentProfile();
  if (profile.mode !== "local") return "Logs are not available for this remote profile through the local CLI.";
  return composeLogs(profile, service);
}

export async function ensureRuntimeReady(): Promise<RuntimeStatusType> {
  const started = Date.now();
  let status = await getRuntimeStatus();
  while (hasStartupPendingStatus(status) && Date.now() - started < 20_000) {
    await delay(1_000);
    status = await getRuntimeStatus();
  }
  return status;
}

export async function runDoctor(): Promise<RuntimeStatusType> {
  const status = await getRuntimeStatus();
  const warnings = [...status.warnings];
  const errors = [...status.errors];
  if (status.mode === "local" && !(await detectRuntime(status.api.detail === "podman" || status.api.detail === "docker" ? status.api.detail : undefined))) {
    errors.push("Docker or Podman compose is not available.");
  }
  if (status.mode === "remote" && status.modelProvider?.state === "not_configured") {
    warnings.push("Remote model provider status is not reported by the Control Plane API.");
  }
  return RuntimeStatus.parse({ ...status, warnings, errors });
}

export async function getRuntimeStatus(): Promise<RuntimeStatusType> {
  const paths = getRuntimePaths();
  let profile: RuntimeProfile;
  try {
    profile = await getCurrentProfile();
  } catch {
    return RuntimeStatus.parse({
      profileName: "missing",
      mode: "local",
      ownership: "managed-by-cli",
      api: { name: "api", state: "not_configured" },
      configPath: paths.configPath,
      warnings: [],
      errors: ["Run open-lagrange init to create a runtime profile."],
    });
  }
  const api = await probe("api", profile.apiUrl);
  const packs = api.state === "running" ? await listPacks(profile.apiUrl, profile.auth) : undefined;
  const warnings: string[] = [];
  const credentials = await credentialStatuses(profile);
  const packHealth = api.state === "running" ? await runtimePackHealth(profile.apiUrl, profile.auth) : undefined;
  if (profile.auth?.type === "oidc") warnings.push("OIDC profiles are typed but interactive login is not implemented yet.");
  return RuntimeStatus.parse({
    profileName: profile.name,
    mode: profile.mode,
    ownership: profile.ownership,
    api,
    ...(profile.mode === "local" ? { hatchet: await probe("hatchet", profile.hatchetUrl), worker: await probeWorker(localWorkerUrl(profile), api), web: await probe("web", profile.webUrl) } : {}),
    ...(packs ? { registeredPacks: packs } : {}),
    ...(packHealth ? { packHealth } : {}),
    modelProvider: await modelStatus(profile.apiUrl, profile.auth, credentials.modelProvider),
    credentials,
    configPath: paths.configPath,
    warnings,
    errors: api.state === "unreachable" ? [`Control Plane API is unreachable at ${profile.apiUrl}`] : [],
  });
}

async function localProfile(runtime?: "docker" | "podman"): Promise<RuntimeProfile> {
  try {
    const profile = await getCurrentProfile();
    if (runtime && profile.mode === "local") return { ...profile, runtimeManager: runtime };
    return profile;
  } catch {
    await initRuntime({ ...(runtime ? { runtime } : {}) });
    return getCurrentProfile();
  }
}

async function runtimeEnv(profile: RuntimeProfile): Promise<NodeJS.ProcessEnv> {
  const packPaths = getProfilePackPaths(profile.name);
  await mkdir(packPaths.trustedLocalDir, { recursive: true });
  return {
    ...process.env,
    ...await modelProviderRuntimeEnv(profile),
    OPEN_LAGRANGE_PROFILE: profile.name,
    OPEN_LAGRANGE_PROFILE_PACKS_DIR: packPaths.packsDir,
  };
}

async function startDevProcesses(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const paths = getRuntimePaths();
  await mkdir(paths.logsDir, { recursive: true });
  const commands: Record<string, readonly string[]> = {
    api: ["npm", "run", "dev:web"],
    worker: ["npm", "run", "dev:worker"],
  };
  const pids: Record<string, number> = {};
  for (const [name, command] of Object.entries(commands)) {
    const logPath = join(paths.logsDir, `${name}.log`);
    const out = await import("node:fs").then((fs) => fs.openSync(logPath, "a"));
    const child = spawn(command[0] ?? "", command.slice(1), { cwd: process.cwd(), detached: true, stdio: ["ignore", out, out], env });
    child.unref();
    if (child.pid) pids[name] = child.pid;
  }
  await writeFile(paths.statePath, JSON.stringify({ pids }, null, 2), "utf8");
}

async function stopDevProcesses(): Promise<void> {
  const paths = getRuntimePaths();
  try {
    const state = JSON.parse(await readFile(paths.statePath, "utf8")) as DevState;
    for (const pid of Object.values(state.pids)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Already stopped.
      }
    }
  } catch {
    // No local process state.
  }
}

async function probe(name: string, url: string | undefined): Promise<ServiceStatus> {
  if (!url) return { name, state: "not_configured" };
  try {
    const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(2500) });
    return { name, state: response.ok || response.status < 500 ? "running" : "error", url, detail: String(response.status) };
  } catch {
    return { name, state: "unreachable", url };
  }
}

async function listPacks(apiUrl: string, auth: RuntimeProfile["auth"]): Promise<string[] | undefined> {
  try {
    const response = await fetch(new URL("/v1/runtime/packs", apiUrl), { headers: await authHeaders(auth), signal: AbortSignal.timeout(2500) });
    if (!response.ok) return undefined;
    const data = await response.json() as { packs?: string[] };
    return data.packs;
  } catch {
    return undefined;
  }
}

async function runtimePackHealth(apiUrl: string, auth: RuntimeProfile["auth"]): Promise<unknown[] | undefined> {
  try {
    const response = await fetch(new URL("/v1/runtime/pack-health", apiUrl), { headers: await authHeaders(auth), signal: AbortSignal.timeout(2500) });
    if (!response.ok) return undefined;
    const data = await response.json() as { packs?: unknown[] };
    return data.packs;
  } catch {
    return undefined;
  }
}

async function modelStatus(apiUrl: string, auth: RuntimeProfile["auth"], localStatus: ServiceStatus): Promise<ServiceStatus> {
  try {
    const response = await fetch(new URL("/v1/runtime/status", apiUrl), { headers: await authHeaders(auth), signal: AbortSignal.timeout(2500) });
    if (!response.ok) return localStatus;
    const data = await response.json() as { modelProvider?: ServiceStatus };
    return data.modelProvider ?? localStatus;
  } catch {
    return localStatus;
  }
}

async function probeWorker(workerUrl: string | undefined, api: ServiceStatus): Promise<ServiceStatus> {
  if (workerUrl) return probe("worker", workerUrl);
  return { name: "worker", state: api.state === "running" ? "unknown" : api.state };
}

function localWorkerUrl(profile: RuntimeProfile): string | undefined {
  return profile.workerUrl ?? (profile.mode === "local" ? "http://localhost:4318/healthz" : undefined);
}

function hasStartupPendingStatus(status: RuntimeStatusType): boolean {
  if (status.mode !== "local") return false;
  return [status.api, status.hatchet, status.worker, status.web].some((service) => service?.state === "unreachable" || service?.state === "starting");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function authHeaders(auth: RuntimeProfile["auth"]): Promise<HeadersInit> {
  if (auth?.type !== "token") return {};
  const profile = await getCurrentProfile().catch(() => undefined);
  const token = profile ? await resolveProfileAuthToken(profile) : auth.tokenEnv ? process.env[auth.tokenEnv] : undefined;
  return token ? { authorization: `Bearer ${token}` } : {};
}

function remoteRefusal(profile: RuntimeProfile, message: string): RuntimeStatusType {
  return RuntimeStatus.parse({
    profileName: profile.name,
    mode: profile.mode,
    ownership: profile.ownership,
    api: { name: "api", state: "unknown", url: profile.apiUrl },
    configPath: getRuntimePaths().configPath,
    warnings: [message],
    errors: [],
  });
}
