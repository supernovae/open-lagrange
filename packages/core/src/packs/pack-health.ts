import { resolve } from "node:path";
import { z } from "zod";
import { packRegistry } from "../capability-registry/registry.js";
import { readInstalledPackRegistry } from "../skills/generated-pack/pack-install.js";
import { loadInstalledPacksForRuntime } from "./runtime-pack-loader.js";

export const PackHealthStatus = z.object({
  pack_id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  status: z.enum(["healthy", "degraded", "unavailable"]),
  validation_status: z.string().min(1),
  loaded: z.boolean(),
  capabilities_registered: z.array(z.string()),
  required_secret_refs: z.array(z.string()),
  missing_secret_refs: z.array(z.string()),
  oauth_status: z.string().min(1),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
}).strict();

export type PackHealthStatus = z.infer<typeof PackHealthStatus>;

export function getPackHealth(input: {
  readonly pack_id?: string;
  readonly packs_dir?: string;
  readonly configured_secret_refs?: readonly string[];
  readonly now?: string;
} = {}): readonly PackHealthStatus[] {
  const packsDir = resolve(input.packs_dir ?? process.env.OPEN_LAGRANGE_PROFILE_PACKS_DIR ?? ".open-lagrange/packs");
  const loadReport = loadInstalledPacksForRuntime(packRegistry, { packs_dir: packsDir, ...(input.now ? { now: input.now } : {}) });
  const installed = readInstalledPackRegistry(resolve(packsDir, ".."));
  const configured = new Set(input.configured_secret_refs ?? []);
  const loadedCapabilities = new Map(loadReport.items.map((item) => [item.pack_id, item.capabilities_registered]));
  const loadErrors = new Map(loadReport.items.map((item) => [item.pack_id, item.errors]));
  const loadWarnings = new Map(loadReport.items.map((item) => [item.pack_id, item.warnings]));
  return installed.packs
    .filter((entry) => !input.pack_id || entry.pack_id === input.pack_id)
    .map((entry) => {
      const pack = packRegistry.getPack(entry.pack_id);
      const capabilities = pack
        ? packRegistry.listCapabilities().filter((capability) => capability.pack_id === entry.pack_id).map((capability) => capability.capability_id)
        : loadedCapabilities.get(entry.pack_id) ?? [];
      const missingSecrets = entry.required_secret_refs.filter((ref) => !configured.has(ref));
      const oauthStatus = entry.oauth_requirements.length === 0 ? "not_required" : "configured_elsewhere";
      const errors = loadErrors.get(entry.pack_id) ?? [];
      const warnings = [
        ...(loadWarnings.get(entry.pack_id) ?? []),
        ...missingSecrets.map((ref) => `Secret reference is not configured in the active profile: ${ref}`),
      ];
      const loaded = Boolean(pack);
      const status = !loaded || errors.length > 0
        ? "unavailable"
        : missingSecrets.length > 0 || entry.validation_status !== "pass"
          ? "degraded"
          : "healthy";
      return PackHealthStatus.parse({
        pack_id: entry.pack_id,
        name: entry.name,
        version: entry.version,
        status,
        validation_status: entry.validation_status,
        loaded,
        capabilities_registered: capabilities,
        required_secret_refs: entry.required_secret_refs,
        missing_secret_refs: missingSecrets,
        oauth_status: oauthStatus,
        errors,
        warnings,
      });
    });
}
