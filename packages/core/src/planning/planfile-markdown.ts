import YAML from "yaml";
import { renderPlanMermaid } from "./mermaid-renderer.js";
import type { PlanValidationIssue } from "./plan-errors.js";
import type { Planfile } from "./planfile-schema.js";

export interface RenderPlanfileMarkdownOptions {
  readonly dry_run_findings?: readonly string[];
  readonly validation_issues?: readonly PlanValidationIssue[];
  readonly next_step?: string;
}

export function renderPlanfileMarkdown(plan: Planfile, options: RenderPlanfileMarkdownOptions = {}): string {
  const acceptance = numbered(plan.goal_frame.acceptance_criteria);
  const assumptions = list(plan.goal_frame.assumptions);
  const nonGoals = list(plan.goal_frame.non_goals);
  const approvals = approvalLines(plan);
  const artifacts = plan.artifact_refs.length > 0
    ? plan.artifact_refs.map((artifact) => `- ${artifact.kind}: ${artifact.path_or_uri} - ${artifact.summary}`).join("\n")
    : "- No artifacts recorded.";
  const errors = [
    ...plan.nodes.flatMap((node) => node.errors.map((error) => `- ${node.id}: ${error}`)),
    ...(options.validation_issues ?? []).map((issue) => `- ${issue.code}: ${issue.message}`),
  ];
  const executableYaml = YAML.stringify(plan);
  return [
    `# Planfile: ${plan.goal_frame.interpreted_goal}`,
    "",
    "## Goal",
    plan.goal_frame.interpreted_goal,
    "",
    "## Assumptions",
    assumptions,
    "",
    "## Non-goals",
    nonGoals,
    "",
    "## Acceptance Criteria",
    acceptance,
    "",
    "## Plan DAG",
    "```mermaid",
    renderPlanMermaid(plan),
    "```",
    "",
    "## Executable Plan",
    "```yaml planfile",
    executableYaml.trimEnd(),
    "```",
    "",
    "## Dry-run Findings",
    list(options.dry_run_findings ?? ["No dry-run findings recorded."]),
    "",
    "## Approval Requirements",
    approvals,
    "",
    "## Execution Status",
    statusProjection(plan),
    "",
    "## Artifacts",
    artifacts,
    "",
    "## Errors",
    errors.length > 0 ? errors.join("\n") : "- No errors recorded.",
    "",
    "## Next Step",
    options.next_step ?? defaultNextStep(plan),
    "",
  ].join("\n");
}

function numbered(items: readonly string[]): string {
  return items.length > 0 ? items.map((item, index) => `${index + 1}. ${item}`).join("\n") : "1. No acceptance criteria recorded.";
}

function list(items: readonly string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None.";
}

function approvalLines(plan: Planfile): string {
  const nodes = plan.nodes.filter((node) => node.approval_required);
  if (nodes.length === 0) return "- No node approval requirements recorded.";
  return nodes.map((node) => `- ${node.id}: ${node.risk_level} approval required`).join("\n");
}

function statusProjection(plan: Planfile): string {
  return plan.nodes.map((node) => `- ${node.id}: ${node.status}`).join("\n");
}

function defaultNextStep(plan: Planfile): string {
  if (plan.status === "draft") return "Validate the executable YAML block.";
  if (plan.status === "validated") return plan.mode === "dry_run" ? "Review the dry-run plan." : "Apply through the control plane.";
  if (plan.status === "pending") return "Start or resume execution through the control plane.";
  return "Review current status and artifacts.";
}
