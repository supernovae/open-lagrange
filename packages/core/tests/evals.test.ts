import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareBenchmarkRun, listBenchmarkScenarios, listModelRouteConfigs, renderBenchmarkReportMarkdown, runModelRoutingBenchmark } from "../src/evals/index.js";
import { createScenarioWorkspace } from "../src/evals/scenario-worktree.js";
import { runScenarioRoute } from "../src/evals/scenario-runner.js";
import { ModelRouteConfig } from "../src/evals/model-route-config.js";
import { BenchmarkScenario } from "../src/evals/benchmark-scenarios.js";
import { createEstimatedUsageRecord, summarizeModelUsage } from "../src/evals/provider-usage.js";

describe("repository eval harness", () => {
  it("validates benchmark scenarios and model route configs", () => {
    const scenarios = listBenchmarkScenarios();
    const routes = listModelRouteConfigs();

    expect(scenarios.map((scenario) => scenario.scenario_id)).toContain("cli-json-status");
    expect(routes.map((route) => route.route_id)).toContain("strong-plan-small-implement");
  });

  it("creates scenario workspaces without mutating fixture sources", () => {
    const source = mkdtempSync(join(tmpdir(), "open-lagrange-eval-source-"));
    mkdirSync(join(source, "src"), { recursive: true });
    writeFileSync(join(source, "src", "index.ts"), "export const value = 1;\n");
    const scenario = BenchmarkScenario.parse({
      scenario_id: "workspace-copy",
      title: "Workspace copy",
      description: "Copy fixture repo.",
      fixture_repo_path: source,
      goal: "update source",
      expected_changed_files: ["src/index.ts"],
      verification_command_ids: ["npm_run_typecheck"],
      success_criteria: { patch_applies: true, verification_must_pass: false },
    });

    const workspace = createScenarioWorkspace({ scenario });
    writeFileSync(join(workspace.repo_root, "src", "index.ts"), "changed\n");

    expect(readFileSync(join(source, "src", "index.ts"), "utf8")).toBe("export const value = 1;\n");
    workspace.cleanup();
  });

  it("skips live scenario cleanly when provider route is unavailable", async () => {
    const scenario = BenchmarkScenario.parse({
      scenario_id: "missing-provider",
      title: "Missing provider",
      description: "Missing provider route.",
      goal: "update readme",
      expected_changed_files: ["README.md"],
      verification_command_ids: ["npm_run_typecheck"],
      success_criteria: { patch_applies: true, verification_must_pass: false },
      fixture_files: { "README.md": "# Demo\n", "package.json": "{\"scripts\":{\"typecheck\":\"node -e \\\"process.exit(0)\\\"\"}}\n" },
    });
    const route = ModelRouteConfig.parse({
      route_id: "native-provider-test",
      label: "Native provider test",
      roles: {
        planner: { provider: "anthropic", model: "claude", role_label: "planner" },
        implementer: { provider: "anthropic", model: "claude", role_label: "implementer" },
        repair: { provider: "anthropic", model: "claude", role_label: "repair" },
        reviewer: { provider: "anthropic", model: "claude", role_label: "reviewer" },
      },
      max_repair_attempts: 1,
      escalation_policy: { enabled: false, escalate_after_repeated_failure_count: 2, escalate_after_validation_failures: 2 },
      authoritative_apply: true,
    });

    const metric = await runScenarioRoute({
      eval_run_id: "eval-test",
      scenario,
      route,
      output_dir: mkdtempSync(join(tmpdir(), "open-lagrange-eval-output-")),
      now: "2026-04-30T12:00:00.000Z",
    });

    expect(metric.status).toBe("skipped");
    expect(metric.error_codes).toContain("MODEL_PROVIDER_UNAVAILABLE");
  });

  it("estimates and aggregates provider usage", () => {
    const record = createEstimatedUsageRecord({
      model_ref: { provider: "openai", model: "gpt-4o-mini", role_label: "implementer" },
      prompt: { goal: "update readme" },
      output: { patch: "ok" },
      latency_ms: 10,
    });
    const summary = summarizeModelUsage([record]);

    expect(summary.total_tokens).toBeGreaterThan(0);
    expect(summary.calls_by_role.implementer).toBe(1);
    expect(summary.model_calls_by_role.implementer).toBe(1);
    expect(summary.tokens_by_role.implementer?.total_tokens).toBe(summary.total_tokens);
    expect(summary.estimated).toBe(true);
  });

  it("aggregates provider usage by role", () => {
    const planner = createEstimatedUsageRecord({
      model_ref: { provider: "openai", model: "gpt-4o", role_label: "planner" },
      prompt: { goal: "plan" },
      output: { plan: "ok" },
      latency_ms: 8,
    });
    const reviewer = createEstimatedUsageRecord({
      model_ref: { provider: "openai", model: "gpt-4o-mini", role_label: "reviewer" },
      prompt: { diff: "summary" },
      output: { review: "ok" },
      latency_ms: 6,
    });

    const summary = summarizeModelUsage([planner, reviewer]);

    expect(summary.model_calls_by_role.planner).toBe(1);
    expect(summary.model_calls_by_role.reviewer).toBe(1);
    expect(summary.tokens_by_role.planner?.total_tokens).toBeGreaterThan(0);
    expect(summary.cost_by_role).toHaveProperty("reviewer");
  });

  it("runs mock benchmark and renders reports", async () => {
    const output = mkdtempSync(join(tmpdir(), "open-lagrange-eval-report-"));
    const report = await runModelRoutingBenchmark({
      benchmark_id: "repo-plan-to-patch",
      mode: "mock",
      max_scenarios: 1,
      output_dir: output,
      now: "2026-04-30T12:00:00.000Z",
    });

    expect(existsSync(join(output, "metrics.json"))).toBe(true);
    expect(renderBenchmarkReportMarkdown(report)).toContain("Avg Cost");
    expect(compareBenchmarkRun(report.run_id, output.replace(/\/eval_[^/]+$/, ""))).toContain("missing");
  });
});
