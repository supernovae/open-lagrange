import type { CapabilityPack } from "@open-lagrange/capability-sdk";
import { exampleReadCapability } from "./capabilities/example-read.js";

export const exampleCapabilityPack: CapabilityPack = {
  manifest: {
    pack_id: "example.read",
    name: "Example Read Pack",
    version: "0.1.0",
    description: "Template for a bounded read-only capability pack.",
    publisher: "example",
    license: "MIT",
    runtime_kind: "local_trusted",
    trust_level: "experimental",
    required_scopes: ["example:read"],
    provided_scopes: ["example:read"],
    default_policy: {},
    open_cot_alignment: { portable: false },
  },
  capabilities: [exampleReadCapability],
};

