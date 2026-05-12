import type { CapabilityPack } from "@open-lagrange/capability-sdk";

export const OUTPUT_PACK_ID = "open-lagrange.output";

export const outputManifest: CapabilityPack["manifest"] = {
  pack_id: OUTPUT_PACK_ID,
  name: "Output Pack",
  version: "0.1.0",
  description: "Trusted local rendering, bundling, export, and digest capabilities for run artifacts.",
  publisher: "Open Lagrange",
  license: "Apache-2.0",
  runtime_kind: "local_trusted",
  trust_level: "trusted_local",
  required_scopes: ["artifact:read"],
  provided_scopes: ["output:read", "output:write", "artifact:read", "artifact:write"],
  default_policy: {
    export_external_publish: false,
    include_raw_logs_by_default: false,
    include_model_calls_by_default: false,
    include_restricted_artifacts: false,
  },
  open_cot_alignment: {
    role: "artifact_output_processing",
    authority: "projection_artifacts",
  },
};
