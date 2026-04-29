import { createPackRegistry, type CapabilityFilter, type CapabilityExecutionResult } from "@open-lagrange/capability-sdk";
import type { PackExecutionContext } from "@open-lagrange/capability-sdk";
import { repositoryPack } from "../capability-packs/repository/pack.js";
import { mockCapabilityPack } from "../capability-packs/mock/pack.js";
import { chatPack } from "../chat-pack/chat-pack.js";
import { sdkDescriptorsToCapabilitySnapshot } from "./open-cot.js";
import type { CapabilitySnapshot } from "../schemas/capabilities.js";
import { loadInstalledPacksForRuntime } from "../packs/runtime-pack-loader.js";

export const packRegistry = createPackRegistry()
  .registerPack(mockCapabilityPack)
  .registerPack(chatPack)
  .registerPack(repositoryPack);

loadInstalledPacksForRuntime(packRegistry);

export function createCapabilitySnapshotForTask(input: CapabilityFilter & { readonly now: string }): CapabilitySnapshot {
  return sdkDescriptorsToCapabilitySnapshot(packRegistry.listCapabilities(input), input.now);
}

export async function executeCapabilityThroughRegistry(input: {
  readonly endpoint_id: string;
  readonly capability_name: string;
  readonly arguments: Record<string, unknown>;
  readonly context: PackExecutionContext;
}): Promise<CapabilityExecutionResult> {
  return packRegistry.executeCapability({
    pack_id: input.endpoint_id,
    name: input.capability_name,
  }, input.arguments, input.context);
}
