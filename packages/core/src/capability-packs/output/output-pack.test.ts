import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createArtifactSummary, registerArtifacts, showArtifact } from "../../artifacts/index.js";
import { selectArtifacts } from "./artifact-selector.js";
import { runOutputExportCommand, runOutputManifestCommand } from "./commands.js";
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

  it("exports binary artifacts without UTF-8 or JSON coercion", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ol-output-binary-"));
    const binaryPath = join(dir, "archive.zip");
    const outputPath = join(dir, "export");
    const bytes = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253]);
    writeFileSync(binaryPath, bytes);
    const indexPath = join(dir, "index.json");
    registerArtifacts({
      index_path: indexPath,
      artifacts: [
        createArtifactSummary({ artifact_id: "zip_1", kind: "zip_export", title: "Zip", summary: "Binary zip", path_or_uri: binaryPath, content_type: "application/zip", related_run_id: "run_1" }),
      ],
    });

    const result = await runOutputExportCommand({ artifact_ids: ["zip_1"], format: "directory", include_manifest: true, output_path: outputPath, index_path: indexPath, output_dir: join(dir, "output-artifacts") });

    const exportedFile = (result.result as { readonly exported_files?: readonly string[] }).exported_files?.find((file) => file.endsWith("zip_export/zip_1.zip"));
    expect(exportedFile && existsSync(exportedFile)).toBe(true);
    expect(readFileSync(exportedFile ?? "")).toEqual(bytes);
  });

  it("uses the active artifact index when computing manifest checksums", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ol-output-manifest-"));
    const firstPath = join(dir, "first.md");
    const secondPath = join(dir, "second.md");
    writeFileSync(firstPath, "first", "utf8");
    writeFileSync(secondPath, "second", "utf8");
    const firstIndex = join(dir, "first-index.json");
    const secondIndex = join(dir, "second-index.json");
    registerArtifacts({ index_path: firstIndex, artifacts: [createArtifactSummary({ artifact_id: "same_id", kind: "research_brief", title: "First", summary: "First", path_or_uri: firstPath, content_type: "text/markdown" })] });
    registerArtifacts({ index_path: secondIndex, artifacts: [createArtifactSummary({ artifact_id: "same_id", kind: "research_brief", title: "Second", summary: "Second", path_or_uri: secondPath, content_type: "text/markdown" })] });

    const result = await runOutputManifestCommand({ artifact_ids: ["same_id"], include_lineage: true, include_checksums: true, index_path: secondIndex, output_dir: join(dir, "output-artifacts") });
    const manifestId = (result.result as { readonly artifact_id?: string }).artifact_id ?? "";
    const manifest = showArtifact(manifestId, secondIndex)?.content as { readonly artifacts?: readonly { readonly checksum_sha256?: string }[] } | undefined;

    expect(manifest?.artifacts?.[0]?.checksum_sha256).toBe(createHash("sha256").update("second").digest("hex"));
  });
});
