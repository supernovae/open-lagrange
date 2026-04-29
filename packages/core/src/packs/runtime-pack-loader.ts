import { existsSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { CapabilitySdkError, type CapabilityDefinition, type CapabilityPack, type PackRegistry } from "@open-lagrange/capability-sdk";
import { readInstalledPackRegistry, type InstalledPackRegistryEntry } from "../skills/generated-pack/pack-install.js";

export interface RuntimeLoadedPackItem {
  readonly pack_id: string;
  readonly status: "loaded" | "skipped" | "failed";
  readonly reason: string;
  readonly capabilities_registered: readonly string[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface RuntimeLoadedPackReport {
  readonly packs_dir: string;
  readonly registry_path: string;
  readonly loaded_count: number;
  readonly items: readonly RuntimeLoadedPackItem[];
}

const ManifestCapability = z.object({
  capability_id: z.string().min(1),
  pack_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default("Manifest-backed capability."),
  input_schema: z.record(z.string(), z.unknown()),
  output_schema: z.record(z.string(), z.unknown()),
  risk_level: z.enum(["read", "write", "destructive", "external_side_effect"]),
  side_effect_kind: z.enum([
    "none",
    "filesystem_read",
    "filesystem_write",
    "network_read",
    "network_write",
    "process_execution",
    "cloud_control_plane",
    "repository_mutation",
    "ticket_mutation",
    "message_send",
  ]),
  requires_approval: z.boolean(),
  idempotency_mode: z.enum(["required", "recommended", "not_applicable"]).default("recommended"),
  timeout_ms: z.number().int().min(1).default(5000),
  max_attempts: z.number().int().min(1).default(1),
  scopes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  examples: z.array(z.unknown()).default([]),
}).passthrough();

const RuntimeManifest = z.object({
  pack_id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().default("Installed local pack."),
  publisher: z.string().default("local"),
  license: z.string().default("MIT"),
  trust_level: z.string().default("trusted_local"),
  runtime_kind: z.string().default("local_trusted"),
  required_scopes: z.array(z.string()).default([]),
  provided_scopes: z.array(z.string()).default([]),
  required_secret_refs: z.array(z.unknown()).default([]),
  oauth: z.unknown().optional(),
  network: z.unknown().optional(),
  filesystem: z.unknown().optional(),
  side_effects: z.array(z.string()).default([]),
  approval_requirements: z.array(z.string()).default([]),
  capabilities: z.array(ManifestCapability),
}).passthrough();

type RuntimeManifest = z.infer<typeof RuntimeManifest>;

let lastReport: RuntimeLoadedPackReport | undefined;

export function loadInstalledPacksForRuntime(registry: PackRegistry, input: {
  readonly packs_dir?: string;
  readonly now?: string;
} = {}): RuntimeLoadedPackReport {
  const packsDir = resolve(input.packs_dir ?? process.env.OPEN_LAGRANGE_PROFILE_PACKS_DIR ?? ".open-lagrange/packs");
  const registryPath = `${packsDir}/registry.json`;
  let installed: ReturnType<typeof readInstalledPackRegistry>;
  try {
    installed = readInstalledPackRegistry(resolve(packsDir, ".."));
  } catch (error) {
    lastReport = {
      packs_dir: packsDir,
      registry_path: registryPath,
      loaded_count: 0,
      items: [{
        pack_id: "registry",
        status: "failed",
        reason: "Installed pack registry failed validation.",
        capabilities_registered: [],
        errors: [message(error)],
        warnings: [],
      }],
    };
    return lastReport;
  }
  const trustedRoot = resolve(packsDir, "trusted-local");
  const items: RuntimeLoadedPackItem[] = [];

  for (const entry of installed.packs) {
    const entryPath = resolve(entry.source_path);
    const warnings: string[] = [];
    const errors: string[] = [];
    try {
      if (registry.getPack(entry.pack_id)) {
        items.push({ pack_id: entry.pack_id, status: "skipped", reason: "Pack is already registered.", capabilities_registered: [], errors, warnings });
        continue;
      }
      if (!isUnder(entryPath, trustedRoot)) {
        items.push({ pack_id: entry.pack_id, status: "skipped", reason: "Installed path is outside trusted-local.", capabilities_registered: [], errors, warnings });
        continue;
      }
      if (entry.validation_status !== "pass") {
        items.push({ pack_id: entry.pack_id, status: "skipped", reason: "Validation status is not pass.", capabilities_registered: [], errors, warnings });
        continue;
      }
      if (entry.generation_mode === "experimental_codegen" && !entry.trust_metadata?.allow_experimental_runtime_load) {
        items.push({ pack_id: entry.pack_id, status: "skipped", reason: "Experimental codegen pack requires explicit runtime trust metadata.", capabilities_registered: [], errors, warnings });
        continue;
      }
      if (!existsSync(entry.manifest_path)) {
        items.push({ pack_id: entry.pack_id, status: "failed", reason: "Manifest is missing.", capabilities_registered: [], errors: ["Manifest is missing."], warnings });
        continue;
      }
      const manifest = RuntimeManifest.parse(YAML.parse(readFileSync(entry.manifest_path, "utf8")));
      if (manifest.pack_id !== entry.pack_id) errors.push("Manifest pack_id does not match registry entry.");
      if (errors.length > 0) {
        items.push({ pack_id: entry.pack_id, status: "failed", reason: "Manifest failed runtime validation.", capabilities_registered: [], errors, warnings });
        continue;
      }
      const pack = manifestBackedPack(manifest, entry);
      registry.registerPack(pack);
      items.push({
        pack_id: entry.pack_id,
        status: "loaded",
        reason: "Manifest-backed local pack loaded.",
        capabilities_registered: manifest.capabilities.map((capability) => capability.capability_id),
        errors,
        warnings,
      });
    } catch (error) {
      items.push({ pack_id: entry.pack_id, status: "failed", reason: message(error), capabilities_registered: [], errors: [message(error)], warnings });
    }
  }

  lastReport = {
    packs_dir: packsDir,
    registry_path: registryPath,
    loaded_count: items.filter((item) => item.status === "loaded").length,
    items,
  };
  return lastReport;
}

export function getRuntimePackLoadReport(): RuntimeLoadedPackReport | undefined {
  return lastReport;
}

function manifestBackedPack(manifest: RuntimeManifest, entry: InstalledPackRegistryEntry): CapabilityPack {
  return {
    manifest: {
      pack_id: manifest.pack_id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      publisher: manifest.publisher,
      license: manifest.license,
      runtime_kind: "local_trusted",
      trust_level: entry.trust_level === "trusted_local" ? "trusted_local" : "review_required",
      required_scopes: manifest.required_scopes,
      provided_scopes: manifest.provided_scopes.length > 0 ? manifest.provided_scopes : manifest.required_scopes,
      default_policy: {
        required_secrets: entry.required_secret_refs,
        oauth_providers: entry.oauth_requirements,
        allowed_hosts: allowedHosts(entry.network_requirements),
        filesystem: entry.filesystem_requirements,
        side_effects: entry.side_effects,
        approval_requirements: entry.approval_requirements,
      },
      open_cot_alignment: { portable: true, runtime_activation: "manifest_backed" },
    },
    capabilities: manifest.capabilities.map((capability) => manifestBackedCapability(capability)),
    async healthCheck() {
      return { ok: true, message: "Manifest-backed local pack is registered." };
    },
  };
}

function manifestBackedCapability(capability: z.infer<typeof ManifestCapability>): CapabilityDefinition {
  return {
    descriptor: {
      capability_id: capability.capability_id,
      pack_id: capability.pack_id,
      name: capability.name,
      description: capability.description,
      input_schema: capability.input_schema,
      output_schema: capability.output_schema,
      risk_level: capability.risk_level,
      side_effect_kind: capability.side_effect_kind,
      requires_approval: capability.requires_approval,
      idempotency_mode: capability.idempotency_mode,
      timeout_ms: capability.timeout_ms,
      max_attempts: capability.max_attempts,
      scopes: capability.scopes,
      tags: [...new Set([...capability.tags, "runtime:manifest-backed"])],
      examples: capability.examples,
    },
    input_schema: z.record(z.string(), z.unknown()),
    output_schema: z.record(z.string(), z.unknown()),
    async execute(context, input) {
      const query = typeof (input as { readonly query?: unknown }).query === "string" ? (input as { readonly query: string }).query : "dry-run";
      const title = summarizeTitle(query);
      const output = {
        title,
        summary: `${capability.name} dry-run response: ${query}`,
        action_items: actionItems(query),
        dry_run: Boolean((input as { readonly dry_run?: unknown }).dry_run ?? true),
      };
      await context.recordArtifact({
        artifact_id: `${capability.capability_id}.manifest_dry_run`,
        kind: "generated_pack_dry_run",
        title,
        summary: output.summary,
        produced_by_pack_id: capability.pack_id,
        produced_by_capability_id: capability.capability_id,
        redacted: true,
        redaction_status: "redacted",
      });
      return output;
    },
  };
}

function isUnder(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
}

function allowedHosts(value: unknown): string[] {
  return Array.isArray((value as { readonly allowed_hosts?: unknown }).allowed_hosts)
    ? (value as { readonly allowed_hosts: unknown[] }).allowed_hosts.map(String)
    : [];
}

function summarizeTitle(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim().length > 0)?.replace(/^#+\s*/, "").trim().slice(0, 80) || "Generated Pack Output";
}

function actionItems(value: string): string[] {
  const items = value.split(/\r?\n/).map((line) => line.replace(/^[-*]\s+/, "").trim()).filter(Boolean).slice(0, 5);
  return items.length > 0 ? items : ["Review generated output."];
}

function message(error: unknown): string {
  if (error instanceof CapabilitySdkError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
