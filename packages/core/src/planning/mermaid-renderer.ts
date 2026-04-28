import type { PlanEdge, Planfile, PlanNode } from "./planfile-schema.js";

export function renderPlanMermaid(plan: Pick<Planfile, "nodes" | "edges">): string {
  const lines = ["flowchart TD"];
  for (const node of plan.nodes) {
    lines.push(`  ${safeMermaidId(node.id)}["${escapeLabel(node.title)}"]`);
  }
  for (const edge of edgesFor(plan.nodes, plan.edges)) {
    const label = edge.reason ? `|${escapeLabel(edge.reason)}|` : "";
    lines.push(`  ${safeMermaidId(edge.from)} -->${label} ${safeMermaidId(edge.to)}`);
  }
  return lines.join("\n");
}

function edgesFor(nodes: readonly PlanNode[], edges: readonly PlanEdge[]): readonly PlanEdge[] {
  if (edges.length > 0) return edges;
  return nodes.flatMap((node) => node.depends_on.map((dependency) => ({ from: dependency, to: node.id, reason: "depends on" })));
}

function safeMermaidId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "'").replace(/\n/g, " ");
}
