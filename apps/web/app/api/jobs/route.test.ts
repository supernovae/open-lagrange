import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SubmitJobPayload } from "./schema";

describe("job route", () => {
  it("validates submit payloads", () => {
    expect(SubmitJobPayload.safeParse({ goal: "Create a summary" }).success).toBe(true);
    expect(SubmitJobPayload.safeParse({ goal: "" }).success).toBe(false);
  });

  it("does not import reconciliation execution modules directly", async () => {
    const routes = [
      "apps/web/app/api/jobs/route.ts",
      "apps/web/app/api/jobs/[projectId]/route.ts",
      "apps/web/app/api/tasks/[taskId]/route.ts",
      "apps/web/app/api/tasks/[taskId]/approve/route.ts",
      "apps/web/app/api/tasks/[taskId]/reject/route.ts",
      "apps/web/app/api/repository/jobs/route.ts",
    ];
    for (const route of routes) {
      const text = await readFile(join(process.cwd(), route), "utf8");
      expect(text).not.toMatch(/from\s+["'][^"']*\/workflows\//);
      expect(text).not.toMatch(/from\s+["'][^"']*\/tasks\//);
      expect(text).not.toMatch(/from\s+["'][^"']*\/mcp\//);
      expect(text).not.toMatch(/from\s+["'][^"']*\/activities\//);
    }
  });
});
