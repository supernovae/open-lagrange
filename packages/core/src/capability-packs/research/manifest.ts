import type { CapabilityPack } from "@open-lagrange/capability-sdk";
import { RESEARCH_PACK_ID } from "./executor.js";

export const researchManifest: CapabilityPack["manifest"] = {
  pack_id: RESEARCH_PACK_ID,
  name: "Research Pack",
  version: "0.1.0",
  description: "Safe fixture-backed source discovery, source fetch, extraction, citation, and research brief capabilities.",
  publisher: "open-lagrange",
  license: "MIT",
  runtime_kind: "local_trusted",
  trust_level: "trusted_local",
  required_scopes: ["project:read"],
  provided_scopes: ["research:read"],
  default_policy: {
    fixture_mode_default: true,
    live_fetch_requires_explicit_mode: true,
    no_cookies: true,
    no_page_javascript: true,
    max_fetch_bytes: 500_000,
  },
  open_cot_alignment: { portable: true, capability_family: "research" },
};
