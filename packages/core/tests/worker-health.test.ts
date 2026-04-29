import { describe, expect, it } from "vitest";
import { createWorkerHealthController } from "../src/hatchet/worker-health.js";

describe("worker health endpoint", () => {
  it("reports worker startup and running state", async () => {
    const health = createWorkerHealthController({
      name: "open-lagrange-worker",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(health.snapshot()).toMatchObject({
      name: "open-lagrange-worker",
      status: "starting",
      workflows_registered: 0,
    });

    health.setRunning(24);
    expect(health.snapshot()).toMatchObject({
      status: "running",
      workflows_registered: 24,
    });
  });
});
