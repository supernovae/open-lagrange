import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireApiAuth, parseJson } from "../http";
import { SubmitJobPayload } from "./schema";
import { assertAllowedRepoRoot } from "../repository/security";

describe("job route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("validates submit payloads", () => {
    expect(SubmitJobPayload.safeParse({ goal: "Create a summary" }).success).toBe(true);
    expect(SubmitJobPayload.safeParse({ goal: "" }).success).toBe(false);
    expect(SubmitJobPayload.safeParse({ goal: "x".repeat(8_001) }).success).toBe(false);
  });

  it("requires configured bearer auth", () => {
    vi.stubEnv("OPEN_LAGRANGE_API_TOKEN", "test-token");
    expect(() => requireApiAuth(new Request("http://local.test/api/jobs"))).toThrow(/HTTP 401/);
    expect(() => requireApiAuth(new Request("http://local.test/api/jobs", { headers: { authorization: "Bearer test-token" } }))).not.toThrow();
  });

  it("rejects oversized JSON bodies before parsing", async () => {
    vi.stubEnv("OPEN_LAGRANGE_MAX_REQUEST_BYTES", "4");
    await expect(parseJson(new Request("http://local.test/api/jobs", { method: "POST", body: JSON.stringify({ goal: "large" }) }), SubmitJobPayload)).rejects.toThrow(/HTTP 413/);
  });

  it("enforces configured repository roots", () => {
    const allowed = resolve("/tmp/open-lagrange-allowed");
    vi.stubEnv("OPEN_LAGRANGE_ALLOWED_REPO_ROOTS", allowed);
    expect(() => assertAllowedRepoRoot(join(allowed, "repo"))).not.toThrow();
    expect(() => assertAllowedRepoRoot("/tmp/not-allowed/repo")).toThrow(/HTTP 403/);
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
