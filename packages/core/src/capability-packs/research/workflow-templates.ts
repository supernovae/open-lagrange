export const researchWorkflowTemplates = [
  {
    template_id: "research_brief_from_topic",
    title: "Research brief from topic",
    runtime_step_kind: "capability_step",
    nodes: [
      { node_id: "search", capability_ref: "research.search" },
      { node_id: "fetch-selected-sources", capability_ref: "research.fetch_source" },
      { node_id: "extract-content", capability_ref: "research.extract_content" },
      { node_id: "create-source-set", capability_ref: "research.create_source_set" },
      { node_id: "create-brief", capability_ref: "research.create_brief" },
      { node_id: "export-markdown", capability_ref: "research.export_markdown" },
    ],
  },
  {
    template_id: "summarize_url",
    title: "Summarize URL",
    runtime_step_kind: "capability_step",
    nodes: [
      { node_id: "fetch-source", capability_ref: "research.fetch_source" },
      { node_id: "extract-content", capability_ref: "research.extract_content" },
      { node_id: "create-brief", capability_ref: "research.create_brief" },
      { node_id: "export-markdown", capability_ref: "research.export_markdown" },
    ],
  },
] as const;

export type ResearchWorkflowTemplate = typeof researchWorkflowTemplates[number];

export function researchWorkflowCapabilityRefs(template_id: ResearchWorkflowTemplate["template_id"]): readonly string[] {
  return researchWorkflowTemplates.find((template) => template.template_id === template_id)?.nodes.map((node) => node.capability_ref) ?? [];
}
