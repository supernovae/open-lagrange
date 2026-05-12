import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createArtifactSummary, registerArtifacts } from "../../artifacts/index.js";
import { selectArtifacts } from "./artifact-selector.js";
import { renderMarkdownToHtml } from "./html-renderer.js";
import { renderPdfUnsupported } from "./pdf-renderer.js";

describe("Output Pack", () => {
  it("selects final outputs by default and excludes restricted/noisy artifacts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ol-output-"));
    const briefPath = join(dir, "brief.md");
    const logPath = join(dir, "raw.log");
    const modelPath = join(dir, "model.json");
    const restrictedPath = join(dir, "restricted.md");
    writeFileSync(briefPath, "# Brief\n", "utf8");
    writeFileSync(logPath, "debug", "utf8");
    writeFileSync(modelPath, "{}", "utf8");
    writeFileSync(restrictedPath, "restricted", "utf8");
    const indexPath = join(dir, "index.json");
    registerArtifacts({
      index_path: indexPath,
      artifacts: [
        createArtifactSummary({ artifact_id: "brief_1", kind: "research_brief", title: "Brief", summary: "Final brief", path_or_uri: briefPath, content_type: "text/markdown", related_run_id: "run_1" }),
        createArtifactSummary({ artifact_id: "log_1", kind: "raw_log", title: "Log", summary: "Raw log", path_or_uri: logPath, content_type: "text/plain", related_run_id: "run_1" }),
        createArtifactSummary({ artifact_id: "model_1", kind: "model_call", title: "Model", summary: "Model call", path_or_uri: modelPath, content_type: "application/json", related_run_id: "run_1" }),
        createArtifactSummary({ artifact_id: "restricted_1", kind: "review_report", title: "Restricted", summary: "Restricted", path_or_uri: restrictedPath, content_type: "text/markdown", related_run_id: "run_1", restricted: true }),
      ],
    });

    const selection = await selectArtifacts({ run_id: "run_1", preset: "final_outputs", include_model_calls: false, include_raw_logs: false, include_redacted_only: true, max_artifacts: 20 }, indexPath);

    expect(selection.selected_artifacts.map((artifact) => artifact.artifact_id)).toEqual(["brief_1"]);
    expect(selection.excluded_artifacts).toContainEqual({ artifact_id: "log_1", reason: "kind_excluded" });
    expect(selection.excluded_artifacts).toContainEqual({ artifact_id: "model_1", reason: "kind_excluded" });
    expect(selection.excluded_artifacts).toContainEqual({ artifact_id: "restricted_1", reason: "restricted" });
  });

  it("sanitizes HTML and removes script and image resources", () => {
    const html = renderMarkdownToHtml({
      title: "Safe",
      markdown: "# Safe\n\n<script>alert(1)</script>\n\n<img src=\"https://example.com/x.png\" />\n\n[link](https://example.com)",
    });

    expect(html).toContain("<h1>Safe</h1>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("rel=\"noopener noreferrer\"");
  });

  it("returns a clear unsupported result for PDF rendering", () => {
    expect(renderPdfUnsupported()).toEqual({
      status: "unsupported",
      reason: expect.stringContaining("PDF rendering is optional"),
      alternatives: ["markdown", "html", "zip"],
    });
  });
});
