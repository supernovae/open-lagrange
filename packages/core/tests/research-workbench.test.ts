import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createArtifactSummary, registerArtifacts } from "../src/artifacts/index.js";
import type { ExtractedSource } from "../src/capability-packs/research/schemas.js";
import { runResearchCreateSourceSet } from "../src/capability-packs/research/executor.js";
import { buildResearchRunView, exportResearchViewArtifact } from "../src/research/index.js";
import type { RunSnapshot } from "../src/runs/index.js";

const now = "2026-05-07T12:00:00.000Z";

describe("research workbench", () => {
  it("records structured source selection reasons", async () => {
    const artifacts: unknown[] = [];
    const output = await runResearchCreateSourceSet({ runtime_config: {}, async recordArtifact(artifact) { artifacts.push(artifact); } }, {
      topic: "container security",
      sources: [source("one", "https://example.com/a"), source("two", "https://example.com/b"), source("three", "https://docs.example.org/c")],
      selection_policy: { max_sources: 2, require_diverse_domains: true },
    });

    expect(output.selection_reasons.map((reason) => reason.reason)).toContain("diverse_domain");
    expect(output.selection_reasons.map((reason) => reason.reason)).toContain("duplicate");
    expect(output.rejected_sources[0]?.reason).toBe("duplicate");
    expect(JSON.stringify(artifacts)).toContain("selection_reasons");
  });

  it("builds a research run view from snapshot artifacts", () => {
    const root = join(".open-lagrange", "test-research-workbench");
    const indexPath = join(root, "artifacts.json");
    mkdirSync(root, { recursive: true });
    const sourceSetPath = join(root, "source_set.json");
    const briefPath = join(root, "brief.md");
    writeFileSync(sourceSetPath, JSON.stringify({
      source_set_id: "set_1",
      topic: "container security",
      selected_sources: [{ source_id: "one", title: "One", url: "https://example.com/a", domain: "example.com", citation_id: "C1" }],
      rejected_sources: [{ source_id: "two", reason: "duplicate" }],
      selection_reasons: [
        { source_id: "one", selected: true, reason: "high_rank" },
        { source_id: "two", selected: false, reason: "duplicate" },
      ],
      artifact_id: "source_set_1",
      warnings: [],
    }), "utf8");
    writeFileSync(briefPath, "# Container Security\n\nCited brief.", "utf8");
    const artifacts = [
      createArtifactSummary({ artifact_id: "source_set_1", kind: "source_set", title: "Source set", summary: "Sources", path_or_uri: sourceSetPath, content_type: "application/json", created_at: now }),
      createArtifactSummary({ artifact_id: "brief_1", kind: "research_brief", title: "Brief", summary: "Brief", path_or_uri: briefPath, content_type: "text/markdown", created_at: now }),
    ];
    registerArtifacts({ artifacts, index_path: indexPath, now });

    const view = buildResearchRunView({ snapshot: snapshot(artifacts.map((artifact) => artifact.artifact_id)), artifact_index_path: indexPath });

    expect(view.source_counts.selected).toBe(1);
    expect(view.source_counts.rejected).toBe(1);
    expect(view.sources.find((item) => item.source_id === "one")?.selection_reason).toBe("high_rank");
    expect(view.brief?.title).toBe("Container Security");
  });

  it("exports markdown brief artifacts", () => {
    const root = join(".open-lagrange", "test-research-workbench-export");
    const indexPath = join(root, "artifacts.json");
    mkdirSync(root, { recursive: true });
    const briefPath = join(root, "brief.md");
    const outputPath = join(root, "export.md");
    writeFileSync(briefPath, "# Brief\n\nBody.", "utf8");
    registerArtifacts({
      artifacts: [createArtifactSummary({ artifact_id: "brief_export_source", kind: "research_brief", title: "Brief", summary: "Brief", path_or_uri: briefPath, content_type: "text/markdown", created_at: now })],
      index_path: indexPath,
      now,
    });

    expect(exportResearchViewArtifact({ artifact_id: "brief_export_source", output_path: outputPath, artifact_index_path: indexPath })).toEqual({ artifact_id: "brief_export_source", output_path: outputPath });
  });
});

function source(sourceId: string, url: string): ExtractedSource {
  const domain = new URL(url).hostname;
  return {
    source_id: sourceId,
    title: sourceId,
    url,
    domain,
    extracted_text: "Body text",
    excerpt: "Body text",
    word_count: 2,
    truncated: false,
    citation: {
      citation_id: `C-${sourceId}`,
      source_id: sourceId,
      title: sourceId,
      url,
      domain,
      retrieved_at: now,
    },
    artifact_id: `artifact_${sourceId}`,
    warnings: [],
  };
}

function snapshot(artifactIds: readonly string[]): RunSnapshot {
  return {
    run_id: "run_research",
    plan_id: "plan_research",
    plan_title: "container security",
    status: "completed",
    runtime: "local_dev",
    nodes: [],
    timeline: [],
    artifacts: artifactIds.map((artifact_id) => ({ artifact_id, kind: artifact_id.startsWith("brief") ? "research_brief" : "source_set", title: artifact_id, summary: artifact_id, path_or_uri: `artifact://${artifact_id}`, created_at: now, exportable: true })),
    approvals: [],
    model_calls: [],
    policy_reports: [],
    errors: [],
    next_actions: [],
    started_at: now,
    completed_at: now,
  };
}
