import type { SourceMode } from "../capability-packs/research/schemas.js";

export interface SourceCoverage {
  readonly source_id: string;
  readonly citation_id: string;
  readonly used_for: readonly string[];
}

export interface CitationIndexEntryView {
  readonly citation_id: string;
  readonly source_id: string;
  readonly title: string;
  readonly url: string;
  readonly domain: string;
  readonly retrieved_at?: string;
  readonly published_at?: string;
}

export interface CitationIndexView {
  readonly citations: readonly CitationIndexEntryView[];
}

export interface ResearchSourceView {
  readonly source_id: string;
  readonly title: string;
  readonly url: string;
  readonly domain: string;
  readonly source_type?: string;
  readonly selected: boolean;
  readonly rejected: boolean;
  readonly rejection_reason?: string;
  readonly selection_reason?: string;
  readonly fetched: boolean;
  readonly extracted: boolean;
  readonly citation_id?: string;
  readonly search_rank?: number;
  readonly provider_id?: string;
  readonly published_at?: string;
  readonly retrieved_at?: string;
  readonly artifact_refs: readonly string[];
  readonly warnings: readonly string[];
  readonly execution_mode?: SourceMode;
}
