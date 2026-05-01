import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composePlanfileFromIntent, createScheduleRecord, listScheduleRecords, parsePlanfileMarkdown, renderPlanMermaid, validatePlanfile } from "../src/planning/index.js";

const now = "2026-05-01T12:00:00.000Z";

describe("intent to Planfile composer", () => {
  it("composes a research topic brief Planfile", async () => {
    const composed = await composePlanfileFromIntent({
      prompt: "research open source container security",
      runtime_profile: { name: "local", searchProviders: [{ id: "local-searxng", kind: "searxng", enabled: true }] },
      mode: "dry_run",
      now,
    });

    expect(composed.intent_frame.domain).toBe("research");
    expect(composed.selected_template?.template_id).toBe("research.topic_brief");
    expect(composed.planfile.nodes.map((node) => node.allowed_capability_refs[0]).filter(Boolean)).toContain("research.search_sources");
    expect(composed.validation_report.ok).toBe(true);
    expect(composed.markdown).toContain("```yaml planfile");
  });

  it("composes a URL summary Planfile", async () => {
    const composed = await composePlanfileFromIntent({
      prompt: "summarize https://example.com as markdown",
      runtime_profile: { name: "local" },
      mode: "dry_run",
      now,
    });

    expect(composed.selected_template?.template_id).toBe("research.url_summary");
    expect(composed.planfile.execution_context?.parameters).toMatchObject({ url: "https://example.com" });
    expect(composed.validation_report.ok).toBe(true);
  });

  it("composes a repository Planfile when repository context is supplied", async () => {
    const composed = await composePlanfileFromIntent({
      prompt: "add JSON output to my CLI status command",
      runtime_profile: { name: "local" },
      context: { repo_path: "." },
      mode: "dry_run",
      now,
    });

    expect(composed.intent_frame.domain).toBe("repository");
    expect(composed.selected_template?.template_id).toBe("repository.plan_to_patch");
    expect(composed.intent_frame.output_expectation?.kind).toBe("git_patch");
    expect(composed.planfile.nodes.some((node) => node.kind === "patch")).toBe(true);
    expect(composed.validation_report.ok).toBe(true);
  });

  it("warns when a live research topic has no search provider", async () => {
    const composed = await composePlanfileFromIntent({
      prompt: "research MCP security risks",
      runtime_profile: { name: "local" },
      mode: "dry_run",
      now,
    });

    expect(composed.warnings.join("\n")).toContain("SEARCH_PROVIDER_NOT_CONFIGURED");
    expect(composed.planfile.nodes.every((node) => node.execution_mode !== "fixture")).toBe(true);
  });

  it("validates an edited Planfile from the executable block and regenerates Mermaid", async () => {
    const composed = await composePlanfileFromIntent({
      prompt: "summarize https://example.com",
      mode: "dry_run",
      now,
    });
    const edited = parsePlanfileMarkdown(composed.markdown.replace("title: Create cited summary", "title: Create edited cited summary"));
    const validation = validatePlanfile(edited);

    expect(validation.ok).toBe(true);
    expect(renderPlanMermaid(edited)).toContain("Create edited cited summary");
  });

  it("captures schedule intent without enabling automatic timed execution", async () => {
    const scheduleIndex = join(mkdtempSync(join(tmpdir(), "open-lagrange-schedule-")), "schedule-index.json");
    const composed = await composePlanfileFromIntent({
      prompt: "Every morning, make me a cited brief on open source container security.",
      runtime_profile: { name: "local", searchProviders: [{ id: "local-searxng", kind: "searxng", enabled: true }] },
      mode: "dry_run",
      now,
    });
    const record = createScheduleRecord({
      planfile: composed.planfile,
      planfile_path: ".open-lagrange/plans/example.plan.md",
      cadence: "daily",
      time_of_day: "08:00",
      timezone: "America/Chicago",
      runtime_profile: "local",
      now,
      index_path: scheduleIndex,
    });

    expect(composed.intent_frame.schedule_intent?.requested).toBe(true);
    expect(record.status).toBe("unsupported_for_automatic_execution");
    expect(listScheduleRecords(scheduleIndex)).toHaveLength(1);
  });
});
