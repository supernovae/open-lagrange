import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { BenchmarkMetrics } from "./benchmark-metrics.js";
import { ScenarioRunMetrics } from "./live-metrics.js";

export const BenchmarkReport = z.object({
  run_id: z.string().min(1),
  benchmark_id: z.string().min(1),
  mode: z.enum(["mock", "live"]),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime(),
  metrics: z.array(z.union([BenchmarkMetrics, ScenarioRunMetrics])),
  observations: z.array(z.string()),
  recommended_defaults: z.array(z.string()),
  output_dir: z.string().min(1),
}).strict();

export type BenchmarkReport = z.infer<typeof BenchmarkReport>;

export function renderBenchmarkReportMarkdown(report: BenchmarkReport): string {
  const grouped = new Map<string, BenchmarkReport["metrics"]>();
  for (const metric of report.metrics) grouped.set(metricRoute(metric), [...(grouped.get(metricRoute(metric)) ?? []), metric]);
  const rows = [...grouped.entries()].map(([configuration, metrics]) => {
    const success = metrics.filter((metric) => metricSuccess(metric)).length;
    const avgTokens = average(metrics.map((metric) => metricTokens(metric)));
    const avgCost = average(metrics.map((metric) => metricCost(metric)));
    const repairs = average(metrics.map((metric) => metric.repair_attempts)).toFixed(1);
    const failures = metrics.reduce((sum, metric) => sum + metric.validation_failures_count, 0);
    const verification = metrics.filter((metric) => metric.verification_passed).length;
    return `| ${configuration} | ${success}/${metrics.length} | ${Math.round(avgTokens)} | ${avgCost > 0 ? `$${avgCost.toFixed(4)}` : "$0.0000"} | ${repairs} | ${failures} | ${verification}/${metrics.length} |`;
  });
  const scenarioRows = report.metrics.map((metric) =>
    `| ${metric.scenario_id} | ${metricRoute(metric)} | ${metricSuccess(metric) ? "passed" : "failed"} | ${metricChangedFiles(metric)} | ${metric.repair_attempts} | ${metric.validation_failures_count} |`,
  );
  const roleRows = report.metrics.flatMap((metric) => {
    if (!("model_usage" in metric)) return [];
    return Object.entries(metric.model_usage.model_calls_by_role).map(([role, calls]) => {
      const tokens = metric.model_usage.tokens_by_role[role]?.total_tokens ?? 0;
      const cost = metric.model_usage.cost_by_role[role] ?? 0;
      const models = metric.model_usage.models_used.join(", ") || "none";
      return `| ${metricRoute(metric)} | ${metric.scenario_id} | ${role} | ${models} | ${calls} | ${tokens} | ${cost > 0 ? `$${cost.toFixed(4)}` : "$0.0000"} |`;
    });
  });
  return [
    `# Repository Plan-to-Patch Benchmark ${report.run_id}`,
    "",
    `Mode: ${report.mode}`,
    "",
    "| Route | Success | Avg Tokens | Avg Cost | Repairs | Validation Failures | Verification |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
    "## Scenarios",
    "",
    "| Scenario | Route | Result | Changed Files | Repairs | Validation Failures |",
    "| --- | --- | --- | --- | ---: | ---: |",
    ...scenarioRows,
    "",
    "## Role Usage",
    "",
    "| Route | Scenario | Role | Models | Calls | Tokens | Cost |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
    ...(roleRows.length > 0 ? roleRows : ["| none | none | none | none | 0 | 0 | $0.0000 |"]),
    "",
    "## Observations",
    ...report.observations.map((item) => `- ${item}`),
    "",
    "## Recommended Defaults",
    ...report.recommended_defaults.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

export function renderBenchmarkReport(runId: string, root = process.cwd()): string {
  const path = resolve(root, ".open-lagrange", "evals", runId, "report.md");
  if (!existsSync(path)) return JSON.stringify({ run_id: runId, status: "missing" }, null, 2);
  return readFileSync(path, "utf8");
}

export function compareBenchmarkRun(runId: string, root = process.cwd()): string {
  const path = resolve(root, ".open-lagrange", "evals", runId, "metrics.json");
  if (!existsSync(path)) return JSON.stringify({ run_id: runId, status: "missing" }, null, 2);
  const report = BenchmarkReport.parse(JSON.parse(readFileSync(path, "utf8")));
  return renderBenchmarkReportMarkdown(report);
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function metricRoute(metric: BenchmarkReport["metrics"][number]): string {
  return "configuration_id" in metric ? metric.configuration_id : metric.route_id;
}

function metricSuccess(metric: BenchmarkReport["metrics"][number]): boolean {
  return "success" in metric ? metric.success : metric.status === "passed";
}

function metricTokens(metric: BenchmarkReport["metrics"][number]): number {
  return "tokens_input" in metric ? metric.tokens_input + metric.tokens_output : metric.model_usage.total_tokens;
}

function metricCost(metric: BenchmarkReport["metrics"][number]): number {
  return "estimated_cost" in metric ? metric.estimated_cost : metric.model_usage.provider_reported_cost_usd ?? metric.model_usage.estimated_cost_usd ?? 0;
}

function metricChangedFiles(metric: BenchmarkReport["metrics"][number]): string {
  return "changed_files" in metric ? metric.changed_files.join(", ") || "none" : `${metric.changed_files_count}`;
}
