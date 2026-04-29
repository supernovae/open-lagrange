import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { packRegistry } from "../capability-registry/registry.js";

export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly status: "pass" | "warn" | "fail";
  readonly summary: string;
}

export interface DoctorReport {
  readonly profile_name: string;
  readonly mode: "local" | "remote" | "unknown";
  readonly checked_at: string;
  readonly checks: readonly DoctorCheck[];
  readonly summary: {
    readonly passed: number;
    readonly warnings: number;
    readonly failures: number;
  };
}

export async function runCoreDoctor(input: { readonly api_url?: string; readonly profile_name?: string } = {}): Promise<DoctorReport> {
  const checked_at = new Date().toISOString();
  const config = readRuntimeConfig();
  const profileName = input.profile_name ?? config.currentProfile ?? "missing";
  const profile = profileName && config.profiles ? config.profiles[profileName] as Record<string, unknown> | undefined : undefined;
  const mode = profile?.mode === "local" || profile?.mode === "remote" ? profile.mode : "unknown";
  const apiUrl = input.api_url ?? stringField(profile?.apiUrl) ?? "http://localhost:4317";
  const checks: DoctorCheck[] = [
    check("config", "Runtime config", config.exists ? "pass" : "fail", config.exists ? `Config found at ${config.path}` : "Run open-lagrange init to create a runtime profile."),
    check("secret_provider", "Secret provider", secretProviderStatus(profile), secretProviderSummary(profile)),
    check("model_credential", "Model credential", modelCredentialConfigured(profile) ? "pass" : "warn", modelCredentialConfigured(profile) ? "Model credential appears configured." : "Model credential is missing or not visible locally."),
    check("pack_registry", "Pack registry", packRegistry.listPacks().length > 0 ? "pass" : "fail", `${packRegistry.listPacks().length} pack(s) registered.`),
    check("repository_pack", "Repository pack", packRegistry.getPack("open-lagrange.repository") ? "pass" : "fail", packRegistry.getPack("open-lagrange.repository") ? "Repository pack registered." : "Repository pack missing."),
    check("sdk_primitives", "SDK primitives", packRegistry.listCapabilities().length > 0 ? "pass" : "warn", `${packRegistry.listCapabilities().length} capability descriptor(s) visible.`),
    check("oauth", "OAuth config", oauthStatus(profile), oauthSummary(profile)),
  ];
  checks.push(await apiCheck(apiUrl, mode));
  checks.push(workerCheck(mode));
  const passed = checks.filter((item) => item.status === "pass").length;
  const warnings = checks.filter((item) => item.status === "warn").length;
  const failures = checks.filter((item) => item.status === "fail").length;
  return { profile_name: profileName, mode, checked_at, checks, summary: { passed, warnings, failures } };
}

function readRuntimeConfig(): { readonly exists: boolean; readonly path: string; readonly currentProfile?: string; readonly profiles?: Record<string, unknown> } {
  const path = join(homedir(), ".open-lagrange", "config.yaml");
  if (!existsSync(path)) return { exists: false, path };
  try {
    const parsed = YAML.parse(readFileSync(path, "utf8")) as { currentProfile?: string; profiles?: Record<string, unknown> };
    return { exists: true, path, ...parsed };
  } catch {
    return { exists: true, path };
  }
}

async function apiCheck(apiUrl: string, mode: DoctorReport["mode"]): Promise<DoctorCheck> {
  try {
    const response = await fetch(apiUrl, { method: "GET", signal: AbortSignal.timeout(1500) });
    return check("api", "Control Plane API", response.status < 500 ? "pass" : "warn", `API responded with HTTP ${response.status}.`);
  } catch {
    return check("api", "Control Plane API", mode === "remote" ? "fail" : "warn", `API is not reachable at ${apiUrl}.`);
  }
}

function workerCheck(mode: DoctorReport["mode"]): DoctorCheck {
  return check("worker", "Worker", mode === "remote" ? "pass" : "warn", mode === "remote" ? "Remote worker status is owned by the API." : "Local worker status is inferred from API/runtime status.");
}

function modelCredentialConfigured(profile: Record<string, unknown> | undefined): boolean {
  const secretRefs = objectField(profile?.secretRefs);
  const activeProvider = stringField(profile?.activeModelProvider) ?? "openai";
  const modelProviders = objectField(profile?.modelProviders);
  const providerConfig = objectField(modelProviders?.[activeProvider]);
  const refKey = stringField(providerConfig?.api_key_secret_ref) ?? activeProvider;
  return Boolean(process.env.OPEN_LAGRANGE_MODEL_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || secretRefs?.[refKey]);
}

function secretProviderStatus(profile: Record<string, unknown> | undefined): DoctorCheck["status"] {
  const secretRefs = objectField(profile?.secretRefs);
  if (!secretRefs || Object.keys(secretRefs).length === 0) return "warn";
  return "pass";
}

function secretProviderSummary(profile: Record<string, unknown> | undefined): string {
  const secretRefs = objectField(profile?.secretRefs);
  if (!secretRefs || Object.keys(secretRefs).length === 0) return "No profile secret refs configured; env fallback may still work.";
  return `Configured refs: ${Object.keys(secretRefs).join(", ")}.`;
}

function oauthStatus(profile: Record<string, unknown> | undefined): DoctorCheck["status"] {
  const auth = objectField(profile?.auth);
  if (!auth || auth.type !== "oidc") return "pass";
  return auth.issuer && auth.clientId ? "pass" : "warn";
}

function oauthSummary(profile: Record<string, unknown> | undefined): string {
  const auth = objectField(profile?.auth);
  if (!auth || auth.type !== "oidc") return "No OAuth profile configured.";
  return auth.issuer && auth.clientId ? "OAuth profile has issuer and client ID." : "OAuth profile is missing issuer or client ID.";
}

function check(id: string, label: string, status: DoctorCheck["status"], summary: string): DoctorCheck {
  return { id, label, status, summary };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function objectField(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}
