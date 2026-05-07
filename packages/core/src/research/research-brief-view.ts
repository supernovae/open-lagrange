import type { SourceCoverage } from "./research-source-view.js";

export interface ResearchBriefView {
  readonly brief_id: string;
  readonly title: string;
  readonly topic: string;
  readonly markdown: string;
  readonly artifact_id: string;
  readonly citation_count: number;
  readonly source_coverage: readonly SourceCoverage[];
  readonly generated_at: string;
  readonly export_artifact_refs: readonly string[];
}
