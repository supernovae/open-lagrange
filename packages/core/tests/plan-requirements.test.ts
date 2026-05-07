import { describe, expect, it } from "vitest";
import { composePlanfileFromIntent, derivePlanRequirements, runPlanCheck } from "../src/planning/index.js";

const now = "2026-05-01T12:00:00.000Z";

describe("plan requirements", () => {
  it("reports missing search provider for a research topic Planfile", async () => {
    const composed = await composePlanfileFromIntent({
      prompt: "research open source container security",
      runtime_profile: { name: "local" },
      mode: "dry_run",
      now,
    });

    const report = derivePlanRequirements({ planfile: composed.planfile, runtime_profile: { name: "local" } });

    expect(report.required_packs).toContain("open-lagrange.research");
    expect(report.required_providers).toContain("search");
    expect(report.missing_providers).toContain("search");
    expect(report.suggested_commands).toContain("open-lagrange up --with-search");
  });

  it("marks absolute repository plans as machine bound", async () => {
    const composed = await composePlanfileFromIntent({
      prompt: "add JSON output to my CLI",
      runtime_profile: { name: "local" },
      context: { repo_path: "/tmp/example-repo" },
      mode: "dry_run",
      now,
    });

    const report = derivePlanRequirements({ planfile: composed.planfile });

    expect(report.required_packs).toContain("open-lagrange.repository");
    expect(report.required_providers).toContain("workspace");
    expect(report.portability_level).toBe("machine_bound");
  });

  it("blocks a run when Plan Check finds a missing provider", async () => {
    const composed = await composePlanfileFromIntent({
      prompt: "research open source container security",
      runtime_profile: { name: "local" },
      mode: "dry_run",
      now,
    });

    const report = runPlanCheck({ planfile: composed.planfile, runtime_profile: { name: "local" }, live: true, now });

    expect(report.status).toBe("missing_requirements");
    expect(report.required_providers.some((provider) => provider.id === "search" && provider.status === "missing")).toBe(true);
    expect(report.suggested_actions.some((action) => action.action_type === "configure_provider")).toBe(true);
  });

  it("surfaces side effects and approval actions without blocking runnable plans", async () => {
    const composed = await composePlanfileFromIntent({
      prompt: "add JSON output to my CLI",
      runtime_profile: { name: "local" },
      context: { repo_path: "." },
      mode: "dry_run",
      now,
    });
    const planfile = {
      ...composed.planfile,
      nodes: composed.planfile.nodes.map((node) => node.risk_level === "write" ? { ...node, approval_required: true } : node),
    };

    const report = runPlanCheck({ planfile, runtime_profile: { name: "local" }, live: true, now });

    expect(report.status).toBe("runnable_with_warnings");
    expect(report.side_effects.length).toBeGreaterThan(0);
    expect(report.approval_requirements.length).toBeGreaterThan(0);
  });
});
