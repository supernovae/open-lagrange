import { buildCapabilitySnapshot, type CapabilityDescriptorInput, type CapabilitySnapshot } from "../../schemas/capabilities.js";
import type { RepositoryWorkspace } from "../../schemas/repository.js";

const DESCRIPTORS: readonly CapabilityDescriptorInput[] = [
  descriptor("repo.list_files", "List repository files under the path policy.", "read", false, ["relative_path"]),
  descriptor("repo.read_file", "Read one repository file under the path policy.", "read", false, ["relative_path"]),
  descriptor("repo.search_text", "Search policy-allowed repository text.", "read", false, ["query"]),
  descriptor("repo.propose_patch", "Validate and preview a Patch Plan without writing files.", "read", false, ["patch_plan"]),
  descriptor("repo.apply_patch", "Apply a validated Patch Plan through repository policy.", "write", true, ["patch_plan", "idempotency_key"]),
  descriptor("repo.run_verification", "Run an allowlisted repository verification command.", "external_side_effect", true, ["command_id"]),
  descriptor("repo.get_diff", "Return repository diff and changed files.", "read", false, []),
  descriptor("repo.create_review_report", "Create a PR-ready repository review report.", "read", false, ["goal"]),
];

export function repositoryCapabilitySnapshot(_workspace: RepositoryWorkspace, now: string): CapabilitySnapshot {
  return buildCapabilitySnapshot(DESCRIPTORS, now);
}

export function repositoryCapabilityDescriptors(): readonly CapabilityDescriptorInput[] {
  return DESCRIPTORS;
}

function descriptor(
  capability_name: string,
  description: string,
  risk_level: CapabilityDescriptorInput["risk_level"],
  requires_approval: boolean,
  required: readonly string[],
): CapabilityDescriptorInput {
  return {
    endpoint_id: "capability-pack:repository",
    capability_name,
    description,
    input_schema: {
      type: "object",
      required: [...required],
      additionalProperties: true,
      properties: Object.fromEntries(required.map((key) => [key, { type: "string" }])),
    },
    output_schema: { type: "object" },
    risk_level,
    requires_approval,
  };
}
