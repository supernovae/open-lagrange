import { describe, expect, it } from "vitest";
import { handleWorkbenchApprovals, handleWorkbenchArtifacts, handleWorkbenchOverview, handleWorkbenchProviders, handleWorkbenchRuns, handleWorkbenchSchedules } from "./handlers";

describe("workbench web handlers", () => {
  it("returns the workbench overview contract", async () => {
    const overview = await handleWorkbenchOverview() as {
      readonly summary?: Record<string, number>;
      readonly sessions?: readonly unknown[];
      readonly runs?: readonly unknown[];
      readonly artifacts?: readonly unknown[];
      readonly schedules?: readonly unknown[];
      readonly approvals?: readonly unknown[];
      readonly packs?: readonly unknown[];
    };

    expect(overview.summary).toMatchObject({
      plans: expect.any(Number),
      runs: expect.any(Number),
      artifacts: expect.any(Number),
      approvals: expect.any(Number),
      schedules: expect.any(Number),
      packs: expect.any(Number),
    });
    expect(Array.isArray(overview.sessions)).toBe(true);
    expect(Array.isArray(overview.runs)).toBe(true);
    expect(Array.isArray(overview.artifacts)).toBe(true);
    expect(Array.isArray(overview.schedules)).toBe(true);
    expect(Array.isArray(overview.approvals)).toBe(true);
    expect(Array.isArray(overview.packs)).toBe(true);
  });

  it("returns collection endpoints for workbench navigation", async () => {
    expect(handleWorkbenchRuns()).toMatchObject({ runs: expect.any(Array) });
    expect(handleWorkbenchArtifacts()).toMatchObject({ artifacts: expect.any(Array) });
    expect(handleWorkbenchSchedules()).toMatchObject({ schedules: expect.any(Array) });
    expect(handleWorkbenchApprovals()).toMatchObject({ approvals: expect.any(Array) });

    const providers = await handleWorkbenchProviders();
    expect(providers).toMatchObject({
      profile: expect.any(String),
      active_model_provider: expect.any(String),
      model_providers: expect.any(Array),
      search_providers: expect.any(Array),
      secret_refs: expect.any(Array),
    });
  });
});
