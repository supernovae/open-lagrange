import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import YAML from "yaml";
import { validateGeneratedPack, type PackValidationReport } from "./pack-validator.js";
import { generatedPackInstallDenied } from "./generated-pack-errors.js";

export interface InstalledPackRegistryEntry {
  readonly pack_id: string;
  readonly name: string;
  readonly version: string;
  readonly source_path: string;
  readonly manifest_path: string;
  readonly trust_level: "review_required" | "trusted_local";
  readonly validation_status: PackValidationReport["status"];
  readonly installed_at: string;
  readonly installed_by: string;
  readonly capabilities: readonly string[];
  readonly required_scopes: readonly string[];
  readonly required_secret_refs: readonly string[];
  readonly oauth_requirements: readonly unknown[];
  readonly network_requirements: unknown;
  readonly filesystem_requirements: unknown;
  readonly side_effects: readonly string[];
  readonly approval_requirements: readonly string[];
  readonly generation_mode: "template_first" | "experimental_codegen";
  readonly trust_metadata?: {
    readonly allow_experimental_runtime_load?: boolean;
    readonly reviewed_by?: string;
    readonly reviewed_at?: string;
  };
  readonly load_status: "pending_restart" | "loaded" | "blocked" | "unavailable_until_reload";
}

export interface InstalledPackRegistry {
  readonly schema_version: "open-lagrange.local-pack-registry.v1";
  readonly packs: readonly InstalledPackRegistryEntry[];
  readonly updated_at: string;
}

export interface PackInstallReport {
  readonly pack_id: string;
  readonly status: "installed";
  readonly install_path: string;
  readonly registry_path: string;
  readonly load_status: InstalledPackRegistryEntry["load_status"];
  readonly validation_status: PackValidationReport["status"];
  readonly message: string;
}

export function installGeneratedPack(input: {
  readonly pack_path: string;
  readonly allow_manual_review_install?: boolean;
  readonly home_dir?: string;
  readonly installed_by?: string;
  readonly now?: string;
}): PackInstallReport {
  const now = input.now ?? new Date().toISOString();
  const validation = validateGeneratedPack({ pack_path: input.pack_path, now });
  if (validation.status === "fail") throw generatedPackInstallDenied("Cannot install a failing generated pack.", { pack_id: validation.pack_id, errors: validation.errors });
  if (validation.status === "requires_manual_review" && !input.allow_manual_review_install) {
    throw generatedPackInstallDenied("Generated pack requires manual review before install.", { pack_id: validation.pack_id, manual_review_items: validation.manual_review_items });
  }
  const root = resolve(input.home_dir ?? ".open-lagrange");
  const installPath = join(root, "packs", "trusted-local", validation.pack_id);
  mkdirSync(join(root, "packs"), { recursive: true });
  cpSync(input.pack_path, installPath, { recursive: true, force: true });
  const manifest = readManifest(join(installPath, "open-lagrange.pack.yaml"));
  const buildPlan = readBuildPlan(join(installPath, "artifacts", "build-plan.json"));
  const registryPath = join(root, "packs", "registry.json");
  const registry = readRegistry(registryPath);
  const entry: InstalledPackRegistryEntry = {
    pack_id: validation.pack_id,
    name: stringField(manifest.name) ?? validation.pack_id,
    version: stringField(manifest.version) ?? "0.1.0",
    source_path: installPath,
    manifest_path: join(installPath, "open-lagrange.pack.yaml"),
    trust_level: validation.status === "pass" ? "trusted_local" : "review_required",
    validation_status: validation.status,
    installed_at: now,
    installed_by: input.installed_by ?? "human-local",
    capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities.map((item) => stringField((item as Record<string, unknown>).capability_id) ?? "").filter(Boolean) : [],
    required_scopes: arrayStrings(manifest.required_scopes),
    required_secret_refs: Array.isArray(manifest.required_secret_refs) ? manifest.required_secret_refs.map((item) => stringField((item as Record<string, unknown>).ref_id) ?? stringField((item as Record<string, unknown>).name) ?? "").filter(Boolean) : [],
    oauth_requirements: Array.isArray((manifest.oauth as { providers?: unknown[] } | undefined)?.providers) ? (manifest.oauth as { providers: unknown[] }).providers : [],
    network_requirements: manifest.network ?? {},
    filesystem_requirements: manifest.filesystem ?? {},
    side_effects: arrayStrings(manifest.side_effects),
    approval_requirements: arrayStrings(manifest.approval_requirements),
    generation_mode: buildPlan.generation_mode ?? generationMode(manifest.generation_mode),
    ...(input.allow_manual_review_install ? { trust_metadata: { reviewed_by: input.installed_by ?? "human-local", reviewed_at: now } } : {}),
    load_status: "pending_restart",
  };
  const next: InstalledPackRegistry = {
    schema_version: "open-lagrange.local-pack-registry.v1",
    packs: [...registry.packs.filter((item) => item.pack_id !== entry.pack_id), entry].sort((left, right) => left.pack_id.localeCompare(right.pack_id)),
    updated_at: now,
  };
  writeFileSync(registryPath, JSON.stringify(next, null, 2), "utf8");
  const report: PackInstallReport = {
    pack_id: entry.pack_id,
    status: "installed",
    install_path: installPath,
    registry_path: registryPath,
    load_status: entry.load_status,
    validation_status: entry.validation_status,
    message: "This pack is installed in the local registry but will not be loaded until the runtime is restarted or pack reload support is implemented.",
  };
  writeFileSync(join(installPath, "artifacts", "install-report.json"), JSON.stringify(report, null, 2), "utf8");
  return report;
}

export function readInstalledPackRegistry(homeDir = defaultHomeDir()): InstalledPackRegistry {
  return readRegistry(join(resolve(homeDir), "packs", "registry.json"));
}

function defaultHomeDir(): string {
  if (process.env.OPEN_LAGRANGE_PROFILE_PACKS_DIR) return resolve(process.env.OPEN_LAGRANGE_PROFILE_PACKS_DIR, "..");
  return process.env.INIT_CWD ? join(process.env.INIT_CWD, ".open-lagrange") : ".open-lagrange";
}

function readRegistry(path: string): InstalledPackRegistry {
  if (!existsSync(path)) return { schema_version: "open-lagrange.local-pack-registry.v1", packs: [], updated_at: new Date(0).toISOString() };
  return JSON.parse(readFileSync(path, "utf8")) as InstalledPackRegistry;
}

function readManifest(path: string): Record<string, unknown> {
  if (!existsSync(path)) return { name: basename(path), version: "0.1.0" };
  return YAML.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function readBuildPlan(path: string): { readonly generation_mode?: "template_first" | "experimental_codegen" } {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { generation_mode?: unknown };
  return parsed.generation_mode === "experimental_codegen" || parsed.generation_mode === "template_first"
    ? { generation_mode: parsed.generation_mode }
    : {};
}

function generationMode(value: unknown): InstalledPackRegistryEntry["generation_mode"] {
  return value === "experimental_codegen" ? "experimental_codegen" : "template_first";
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}
