export type ResearchWorkbenchTab = "timeline" | "sources" | "brief" | "citations" | "artifacts" | "plan" | "schedule";

export interface ResearchWorkbenchState {
  readonly active_run_id?: string;
  readonly selected_source_id?: string;
  readonly selected_artifact_id?: string;
  readonly selected_citation_id?: string;
  readonly active_tab: ResearchWorkbenchTab;
}

export function defaultResearchWorkbenchState(input: { readonly run_id?: string } = {}): ResearchWorkbenchState {
  return {
    ...(input.run_id ? { active_run_id: input.run_id } : {}),
    active_tab: "timeline",
  };
}
