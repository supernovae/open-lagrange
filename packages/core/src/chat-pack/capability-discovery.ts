import { z } from "zod";
import { listArtifacts } from "../artifacts/artifact-viewer.js";
import { packRegistry } from "../capability-registry/registry.js";
import { listDemos } from "../demos/demo-registry.js";
import { getPackHealth } from "../packs/pack-health.js";
import type { RuntimeHealth } from "../user-frame-events.js";

export const CapabilitySummary = z.object({
  packs: z.array(z.object({
    pack_id: z.string(),
    name: z.string(),
    description: z.string(),
    capabilities: z.array(z.object({
      capability_id: z.string(),
      name: z.string(),
      description: z.string(),
      risk_level: z.string(),
      requires_approval: z.boolean(),
    })),
  })),
  demos: z.array(z.object({ demo_id: z.string(), title: z.string(), summary: z.string() })),
  artifacts: z.array(z.object({ artifact_id: z.string(), kind: z.string(), title: z.string() })),
  pack_health: z.array(z.unknown()),
  runtime: z.record(z.string(), z.unknown()),
}).strict();

export type CapabilitySummary = z.infer<typeof CapabilitySummary>;

export function getCapabilitiesSummary(input: { readonly health?: RuntimeHealth; readonly artifact_limit?: number } = {}): CapabilitySummary {
  const capabilities = packRegistry.listCapabilities();
  const packs = packRegistry.listPacks().map((pack) => ({
    pack_id: pack.manifest.pack_id,
    name: pack.manifest.name,
    description: pack.manifest.description,
    capabilities: capabilities
      .filter((capability) => capability.pack_id === pack.manifest.pack_id)
      .map((capability) => ({
        capability_id: capability.capability_id,
        name: capability.name,
        description: capability.description,
        risk_level: capability.risk_level,
        requires_approval: capability.requires_approval,
      })),
  }));
  return CapabilitySummary.parse({
    packs,
    demos: listDemos().map((demo) => ({ demo_id: demo.demo_id, title: demo.title, summary: demo.summary })),
    artifacts: listArtifacts().slice(-(input.artifact_limit ?? 8)).map((artifact) => ({
      artifact_id: artifact.artifact_id,
      kind: artifact.kind,
      title: artifact.title,
    })),
    pack_health: getPackHealth(),
    runtime: input.health ? redactedRuntime(input.health) : {},
  });
}

function redactedRuntime(health: RuntimeHealth): Record<string, unknown> {
  return {
    profile: health.profile,
    api: health.api,
    worker: health.worker,
    hatchet: health.hatchet,
    packs: health.packs,
    model: health.model,
    remote_auth: health.remote_auth ?? "missing",
    secret_provider: health.secret_provider ?? "unknown",
  };
}
