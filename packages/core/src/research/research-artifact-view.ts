import { showArtifact, type ArtifactSummary } from "../artifacts/index.js";

export type ResearchArtifactViewKind =
  | "source_search_results"
  | "source_set"
  | "source_snapshot"
  | "source_text"
  | "research_brief"
  | "citation_index"
  | "markdown_export";

export interface ResearchArtifactView {
  readonly artifact_id: string;
  readonly kind: ResearchArtifactViewKind;
  readonly title: string;
  readonly summary: string;
  readonly path_or_uri: string;
  readonly content?: unknown;
}

export function isResearchArtifactKind(kind: string): kind is ResearchArtifactViewKind {
  return kind === "source_search_results"
    || kind === "source_set"
    || kind === "source_snapshot"
    || kind === "source_text"
    || kind === "research_brief"
    || kind === "citation_index"
    || kind === "markdown_export";
}

export function buildResearchArtifactViews(input: {
  readonly artifacts: readonly Pick<ArtifactSummary, "artifact_id" | "kind" | "title" | "summary" | "path_or_uri">[];
  readonly artifact_index_path?: string;
}): readonly ResearchArtifactView[] {
  return input.artifacts.flatMap((artifact) => {
    if (!isResearchArtifactKind(artifact.kind)) return [];
    const content = showArtifact(artifact.artifact_id, input.artifact_index_path)?.content;
    return [{
      artifact_id: artifact.artifact_id,
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary,
      path_or_uri: artifact.path_or_uri,
      ...(content === undefined ? {} : { content }),
    }];
  });
}
