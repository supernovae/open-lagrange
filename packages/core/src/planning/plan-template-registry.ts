import { z } from "zod";

export const TemplateNode = z.object({
  node_id: z.string().min(1),
  kind: z.enum(["frame", "inspect", "analyze", "design", "patch", "verify", "repair", "review", "approval", "finalize"]),
  title: z.string().min(1),
  objective: z.string().min(1),
  description: z.string().min(1),
  depends_on: z.array(z.string().min(1)),
  capability_ref: z.string().min(1).optional(),
  expected_outputs: z.array(z.string().min(1)),
  input: z.unknown().optional(),
  optional: z.boolean().optional(),
}).strict();

export const PlanTemplate = z.object({
  template_id: z.string().min(1),
  pack_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  domains: z.array(z.string().min(1)),
  intent_patterns: z.array(z.string().min(1)),
  required_capabilities: z.array(z.string().min(1)),
  optional_capabilities: z.array(z.string().min(1)),
  parameters_schema: z.unknown(),
  nodes_template: z.array(TemplateNode),
  output_kind: z.string().min(1),
  schedule_supported: z.boolean(),
}).strict();

export type TemplateNode = z.infer<typeof TemplateNode>;
export type PlanTemplate = z.infer<typeof PlanTemplate>;

export class PlanTemplateRegistry {
  private readonly templates = new Map<string, PlanTemplate>();

  register(template: PlanTemplate): this {
    this.templates.set(template.template_id, PlanTemplate.parse(template));
    return this;
  }

  list(): readonly PlanTemplate[] {
    return [...this.templates.values()].sort((left, right) => left.template_id.localeCompare(right.template_id));
  }

  get(templateId: string): PlanTemplate | undefined {
    return this.templates.get(templateId);
  }
}

export function createCorePlanTemplateRegistry(): PlanTemplateRegistry {
  return new PlanTemplateRegistry()
    .register(researchTopicBriefTemplate)
    .register(researchUrlSummaryTemplate)
    .register(repositoryPlanToPatchTemplate);
}

const researchTopicBriefTemplate = PlanTemplate.parse({
  template_id: "research.topic_brief",
  pack_id: "open-lagrange.research",
  title: "Research topic brief",
  description: "Create a cited Markdown brief from bounded provider-backed source discovery.",
  domains: ["research"],
  intent_patterns: ["research", "brief", "cited", "sources", "markdown"],
  required_capabilities: [
    "research.plan_search",
    "research.search_sources",
    "research.select_sources",
    "research.fetch_source",
    "research.extract_content",
    "research.create_source_set",
    "research.create_brief",
    "research.export_markdown",
  ],
  optional_capabilities: [],
  parameters_schema: { type: "object" },
  output_kind: "markdown_brief",
  schedule_supported: true,
  nodes_template: [
    templateNode("frame_goal", "frame", "Frame research goal", "Confirm topic, output, constraints, and source expectations.", [], undefined, ["IntentFrame"]),
    templateNode("plan_search", "inspect", "Plan source search", "Create a bounded SearchPlan for the topic.", ["frame_goal"], "research.plan_search", ["SearchPlan"], { topic: "$parameters.topic", objective: "$parameters.objective", provider_id: "$parameters.provider_id", max_results: "$parameters.max_sources" }),
    templateNode("search_sources", "inspect", "Search source candidates", "Execute bounded provider-backed search.", ["plan_search"], "research.search_sources", ["SearchResultSet"], { search_plan: "$nodes.plan_search.output.search_plan", mode: "live", urls: "$parameters.urls" }),
    templateNode("select_sources", "analyze", "Select sources", "Select a bounded set of source candidates.", ["search_sources"], "research.select_sources", ["Selected source candidates"], { result_set: "$nodes.search_sources.output.result_set", max_sources: "$parameters.max_sources" }),
    templateNode("fetch_source", "inspect", "Fetch selected source", "Fetch the top selected source through policy and SDK HTTP primitives.", ["select_sources"], "research.fetch_source", ["Source snapshot"], { url: "$nodes.select_sources.output.selected_sources.0.url", source_id: "$nodes.select_sources.output.selected_sources.0.source_id", mode: "live" }),
    templateNode("extract_content", "analyze", "Extract source content", "Extract readable text and citation metadata.", ["fetch_source"], "research.extract_content", ["Extracted source"], { source_artifact_id: "$nodes.fetch_source.output.text_artifact_id", url: "$nodes.fetch_source.output.url" }),
    templateNode("create_source_set", "analyze", "Create source set", "Create a cited source set from extracted sources.", ["extract_content"], "research.create_source_set", ["Source set"], { topic: "$parameters.topic", sources: ["$nodes.extract_content.output"], selection_policy: { max_sources: "$parameters.max_sources", prefer_official: true, require_diverse_domains: true } }),
    templateNode("create_brief", "analyze", "Create cited brief", "Create a cited Markdown brief from extracted sources only.", ["create_source_set"], "research.create_brief", ["Research brief"], { topic: "$parameters.topic", source_set_id: "$nodes.create_source_set.output.source_set_id", sources: ["$nodes.extract_content.output"], brief_style: "$parameters.brief_style", include_recommendations: false, max_words: 800 }),
    templateNode("export_markdown", "finalize", "Export Markdown brief", "Write the brief as an indexed Markdown artifact.", ["create_brief"], "research.export_markdown", ["Markdown artifact"], { title: "$parameters.title", markdown: "$nodes.create_brief.output.markdown", related_source_ids: "$nodes.create_source_set.output.selected_sources" }),
  ],
});

const researchUrlSummaryTemplate = PlanTemplate.parse({
  template_id: "research.url_summary",
  pack_id: "open-lagrange.research",
  title: "Research URL summary",
  description: "Fetch one explicit URL and create a cited Markdown summary.",
  domains: ["research"],
  intent_patterns: ["url", "fetch", "summarize", "summary"],
  required_capabilities: ["research.fetch_source", "research.extract_content", "research.create_brief", "research.export_markdown"],
  optional_capabilities: [],
  parameters_schema: { type: "object" },
  output_kind: "markdown_brief",
  schedule_supported: false,
  nodes_template: [
    templateNode("frame_goal", "frame", "Frame URL summary goal", "Confirm URL and output expectations.", [], undefined, ["IntentFrame"]),
    templateNode("fetch_source", "inspect", "Fetch URL", "Fetch the explicit URL through policy and SDK HTTP primitives.", ["frame_goal"], "research.fetch_source", ["Source snapshot"], { url: "$parameters.url", mode: "live" }),
    templateNode("extract_content", "analyze", "Extract source content", "Extract readable text and citation metadata.", ["fetch_source"], "research.extract_content", ["Extracted source"], { source_artifact_id: "$nodes.fetch_source.output.text_artifact_id", url: "$nodes.fetch_source.output.url" }),
    templateNode("create_brief", "analyze", "Create cited summary", "Create a cited Markdown summary from the extracted source.", ["extract_content"], "research.create_brief", ["Markdown summary"], { topic: "$parameters.topic", sources: ["$nodes.extract_content.output"], brief_style: "concise", include_recommendations: false, max_words: 500 }),
    templateNode("export_markdown", "finalize", "Export Markdown summary", "Write the summary as an indexed Markdown artifact.", ["create_brief"], "research.export_markdown", ["Markdown artifact"], { title: "$parameters.title", markdown: "$nodes.create_brief.output.markdown", related_source_ids: ["$nodes.extract_content.output.source_id"] }),
  ],
});

const repositoryPlanToPatchTemplate = PlanTemplate.parse({
  template_id: "repository.plan_to_patch",
  pack_id: "open-lagrange.repository",
  title: "Repository Plan-to-Patch",
  description: "Create a reviewable repository Planfile for patch work.",
  domains: ["repository"],
  intent_patterns: ["repo", "repository", "patch", "cli", "json output", "fix", "add", "update"],
  required_capabilities: ["repo.list_files", "repo.search_text", "repo.read_file", "repo.propose_patch", "repo.run_verification", "repo.get_diff", "repo.create_review_report"],
  optional_capabilities: ["repo.apply_patch"],
  parameters_schema: { type: "object" },
  output_kind: "git_patch",
  schedule_supported: false,
  nodes_template: [
    templateNode("frame_goal", "frame", "Frame repository goal", "Confirm repository goal and acceptance criteria.", [], undefined, ["Goal frame"]),
    templateNode("inspect_repo", "inspect", "Inspect repository evidence", "Collect bounded repository evidence for the requested change.", ["frame_goal"], "repo.list_files", ["Repository evidence"]),
    templateNode("collect_evidence", "inspect", "Collect focused evidence", "Search and read policy-allowed files relevant to the change.", ["inspect_repo"], "repo.search_text", ["Evidence bundle"]),
    templateNode("generate_patch_plan", "design", "Generate patch plan", "Design a bounded PatchPlan from collected evidence.", ["collect_evidence"], undefined, ["PatchPlan"]),
    templateNode("apply_patch", "patch", "Apply structured patch", "Apply a validated patch in the repository execution path.", ["generate_patch_plan"], "repo.propose_patch", ["Patch preview"]),
    templateNode("verify", "verify", "Verify patch", "Run allowlisted verification.", ["apply_patch"], "repo.run_verification", ["Verification report"]),
    templateNode("review", "review", "Review repository result", "Create a review report from patch and verification evidence.", ["verify"], "repo.create_review_report", ["Review report"]),
    templateNode("export_patch", "finalize", "Export patch", "Export the final git patch artifact.", ["review"], "repo.get_diff", ["Git patch artifact"]),
  ],
});

function templateNode(
  node_id: TemplateNode["node_id"],
  kind: TemplateNode["kind"],
  title: string,
  description: string,
  depends_on: readonly string[],
  capability_ref: string | undefined,
  expected_outputs: readonly string[],
  input?: unknown,
): TemplateNode {
  return TemplateNode.parse({
    node_id,
    kind,
    title,
    objective: description,
    description,
    depends_on: [...depends_on],
    ...(capability_ref ? { capability_ref } : {}),
    expected_outputs: [...expected_outputs],
    ...(input === undefined ? {} : { input }),
  });
}
