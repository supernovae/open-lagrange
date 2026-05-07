import { mkdtempSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addPlanLibrary, addPlanLibraryEntry, composePlanfileFromIntent, instantiatePlanTemplate, listPlanLibraries, listPlanLibrary, listPlanLibraryPlans, renderPlanfileMarkdown, savePlanToLibrary, showPlanFromLibrary } from "../src/planning/index.js";

const now = "2026-05-01T12:00:00.000Z";

describe("plan library", () => {
  it("lists local Planfiles from a library root", async () => {
    const root = mkdtempSync(join(tmpdir(), "open-lagrange-plans-"));
    const composed = await composePlanfileFromIntent({ prompt: "summarize https://example.com", mode: "dry_run", now });
    const path = join(root, "summary.plan.md");
    writeFileSync(path, renderPlanfileMarkdown(composed.planfile), "utf8");

    const plans = listPlanLibrary({ roots: [root] });

    expect(plans).toHaveLength(1);
    expect(plans[0]?.plan_id).toBe(composed.planfile.plan_id);
    expect(plans[0]?.portability_level).toBe("portable");
  });

  it("adds manifest entries and instantiates simple templates", () => {
    const root = mkdtempSync(join(tmpdir(), "open-lagrange-library-"));
    const manifest = join(root, "open-lagrange-plans.yaml");
    const template = join(root, "template.plan.md");
    const output = join(root, "output.plan.md");
    writeFileSync(template, "topic: ${topic}\nowner: {{owner}}\n", "utf8");

    const next = addPlanLibraryEntry({ name: "daily-brief", path: template, manifest_path: manifest });
    const rendered = instantiatePlanTemplate({ template_path: template, params: { topic: "security", owner: "platform" }, write_path: output });

    expect(next.plans[0]?.name).toBe("daily-brief");
    expect(rendered.content).toContain("topic: security");
    expect(rendered.content).toContain("owner: platform");
  });

  it("saves Planfiles to a named workspace library and reads them back", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "open-lagrange-workspace-"));
    const source = join(workspace, "source.plan.md");
    const composed = await composePlanfileFromIntent({ prompt: "summarize https://example.com", mode: "dry_run", now });
    writeFileSync(source, renderPlanfileMarkdown(composed.planfile), "utf8");

    addPlanLibrary({ name: "team", path: join(workspace, "team-plans"), workspace_root: workspace });
    const saved = savePlanToLibrary({
      planfile_path: source,
      library: "team",
      path: "research/example.plan.md",
      tags: ["research"],
      workspace_root: workspace,
    });
    const libraries = listPlanLibraries({ workspace_root: workspace, home_root: join(workspace, "home") });
    const plans = listPlanLibraryPlans({ library: "team", workspace_root: workspace, home_root: join(workspace, "home") });
    const detail = showPlanFromLibrary({ library: "team", plan: "example", workspace_root: workspace, home_root: join(workspace, "home") });

    expect(saved.library).toBe("team");
    expect(libraries.some((library) => library.name === "team")).toBe(true);
    expect(plans[0]?.plan_id).toBe(composed.planfile.plan_id);
    expect(detail.content).toContain(composed.planfile.plan_id);
  });
});
