import { describe, expect, it } from "vitest";
import { composePlanfileFromIntent, derivePlanRequirements } from "../src/planning/index.js";

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
});
