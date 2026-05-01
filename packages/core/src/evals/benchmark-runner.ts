import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createArtifactSummary, registerArtifacts } from "../artifacts/index.js";
import { stableHash } from "../util/hash.js";
import { type BenchmarkConfigurationId, BenchmarkMetrics, estimateTokens } from "./benchmark-metrics.js";
import { loadBenchmarkScenarios, type BenchmarkScenario } from "./benchmark-scenarios.js";
import { BenchmarkReport, renderBenchmarkReportMarkdown } from "./benchmark-report.js";
import { findModelRouteConfig, listModelRouteConfigs } from "./model-route-config.js";
import { runScenarioRoute } from "./scenario-runner.js";
import type { ScenarioRunMetrics } from "./live-metrics.js";

export interface RunModelRoutingBenchmarkInput {
  readonly benchmark_id: string;
  readonly mode: "mock" | "live";
  readonly scenario_id?: string;
  readonly route_id?: string;
  readonly max_scenarios?: number;
  readonly retain_worktrees?: boolean;
  readonly yes?: boolean;
  readonly output_dir?: string;
  readonly now?: string;
}

const configurations: readonly BenchmarkConfigurationId[] = [
  "deterministic-preview",
  "small-model-patch",
  "strong-model-patch",
  "small-repair-strong-escalation",
  "strong-plan-small-implement",
];

export async function runModelRoutingBenchmark(input: RunModelRoutingBenchmarkInput): Promise<BenchmarkReport> {
  const started = input.now ?? new Date().toISOString();
  const scenarios = filterScenarios(loadBenchmarkScenarios(), input.scenario_id, input.max_scenarios);
  const runId = `eval_${stableHash({ benchmark: input.benchmark_id, mode: input.mode, started }).slice(0, 18)}`;
  const outputDir = resolve(input.output_dir ?? join(process.cwd(), ".open-lagrange", "evals", runId));
  mkdirSync(outputDir, { recursive: true });
  const metrics = input.mode === "live"
    ? await runLiveMetrics({
        eval_run_id: runId,
        scenarios,
        output_dir: outputDir,
        retain_worktrees: input.retain_worktrees ?? false,
        now: started,
        ...(input.route_id ? { route_id: input.route_id } : {}),
      })
    : scenarios.flatMap((scenario) => configurations.map((configuration) => mockMetric({
        scenario,
        configuration,
        live: false,
        started,
      })));
  const completed = new Date().toISOString();
  const report = BenchmarkReport.parse({
    run_id: runId,
    benchmark_id: input.benchmark_id,
    mode: input.mode,
    started_at: started,
    completed_at: completed,
    metrics,
    observations: [
      input.mode === "mock" ? "Mock mode used deterministic fixture PatchPlan outputs." : "Live mode executed scenario repositories through RepositoryPlanRunner.",
      "Validation and verification metrics are normalized per scenario.",
    ],
    recommended_defaults: recommendedDefaults(input.mode),
    output_dir: outputDir,
  });
  const markdown = renderBenchmarkReportMarkdown(report);
  writeFileSync(join(outputDir, "metrics.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(outputDir, "report.md"), markdown, "utf8");
  writeFileSync(join(outputDir, "metrics.csv"), csv(report.metrics), "utf8");
  registerArtifacts({
    artifacts: [
      createArtifactSummary({
        artifact_id: `${runId}_metrics`,
        kind: "raw_log",
        title: "Benchmark Metrics",
        summary: `${report.metrics.length} benchmark metric rows.`,
        path_or_uri: join(outputDir, "metrics.json"),
        content_type: "application/json",
        created_at: completed,
      }),
      createArtifactSummary({
        artifact_id: `${runId}_report`,
        kind: "raw_log",
        title: "Benchmark Report",
        summary: "Repository Plan-to-Patch benchmark summary.",
        path_or_uri: join(outputDir, "report.md"),
        content_type: "text/markdown",
        created_at: completed,
      }),
    ],
    now: completed,
  });
  return report;
}

async function runLiveMetrics(input: {
  readonly eval_run_id: string;
  readonly scenarios: readonly BenchmarkScenario[];
  readonly route_id?: string;
  readonly output_dir: string;
  readonly retain_worktrees: boolean;
  readonly now: string;
}) {
  const routes = input.route_id ? [findModelRouteConfig(input.route_id)].filter((route) => route !== undefined) : listModelRouteConfigs();
  const metrics = [];
  for (const scenario of input.scenarios) {
    for (const route of routes) {
      metrics.push(await runScenarioRoute({
        eval_run_id: input.eval_run_id,
        scenario,
        route,
        output_dir: input.output_dir,
        retain_worktrees: input.retain_worktrees,
        now: input.now,
      }));
    }
  }
  return metrics;
}

function mockMetric(input: {
  readonly scenario: BenchmarkScenario;
  readonly configuration: BenchmarkConfigurationId;
  readonly live: boolean;
  readonly started: string;
}) {
  const inputTokens = input.configuration === "deterministic-preview" ? 0 : estimateTokens({
    goal: input.scenario.goal,
    files: input.scenario.fixture_files,
    success: input.scenario.success_criteria,
  });
  const outputTokens = input.configuration === "deterministic-preview" ? 0 : estimateTokens(input.scenario.expected_changed_files);
  const validationFailures = input.configuration === "small-model-patch" ? 1 : 0;
  const repairAttempts = input.configuration === "small-model-patch" ? 1 : input.configuration === "strong-model-patch" ? 0 : input.configuration === "deterministic-preview" ? 0 : 1;
  return BenchmarkMetrics.parse({
    scenario_id: input.scenario.scenario_id,
    configuration_id: input.configuration,
    success: input.configuration !== "deterministic-preview" || input.scenario.expected_changed_files.length <= 1,
    patch_validated: validationFailures === 0,
    verification_passed: input.configuration !== "small-model-patch",
    validation_failures_count: validationFailures,
    repair_attempts: repairAttempts,
    scope_expansion_requests: input.configuration === "small-model-patch" ? 1 : 0,
    approvals_required: input.configuration === "small-model-patch" ? 1 : 0,
    tokens_input: inputTokens,
    tokens_output: outputTokens,
    estimated_cost: input.live ? (inputTokens + outputTokens) * 0.000002 : 0,
    wall_clock_ms: input.live ? 2500 + inputTokens : 50 + inputTokens,
    capability_calls_count: 4 + repairAttempts,
    repeated_action_count: repairAttempts > 1 ? repairAttempts - 1 : 0,
    changed_files_count: input.scenario.expected_changed_files.length,
    final_patch_size: input.scenario.expected_changed_files.length * 420,
    review_report_quality_flags: input.configuration === "deterministic-preview" ? ["baseline"] : ["bounded_context", "schema_valid"],
  });
}

function csv(metrics: readonly (BenchmarkMetrics | ScenarioRunMetrics)[]): string {
  const header = "scenario_id,route_id,status,input_tokens,output_tokens,repair_attempts,validation_failures_count,verification_passed";
  return [
    header,
    ...metrics.map((metric) => [
      metric.scenario_id,
      "configuration_id" in metric ? metric.configuration_id : metric.route_id,
      "success" in metric ? String(metric.success) : metric.status,
      String("tokens_input" in metric ? metric.tokens_input : metric.model_usage.input_tokens),
      String("tokens_output" in metric ? metric.tokens_output : metric.model_usage.output_tokens),
      String(metric.repair_attempts),
      String(metric.validation_failures_count),
      String(metric.verification_passed),
    ].join(",")),
    "",
  ].join("\n");
}

function filterScenarios(scenarios: readonly BenchmarkScenario[], scenarioId: string | undefined, maxScenarios: number | undefined): readonly BenchmarkScenario[] {
  const filtered = scenarioId ? scenarios.filter((scenario) => scenario.scenario_id === scenarioId) : scenarios;
  return maxScenarios === undefined ? filtered : filtered.slice(0, maxScenarios);
}

function recommendedDefaults(mode: "mock" | "live"): readonly string[] {
  if (mode === "mock") return ["Use mock mode in CI.", "Run live mode explicitly for provider-backed comparisons."];
  return ["Prefer the cheapest route that passes validation and verification.", "Escalate repair only after repeated or validation-heavy failures."];
}
