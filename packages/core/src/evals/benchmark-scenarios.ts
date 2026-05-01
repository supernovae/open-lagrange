import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const BenchmarkSuccessCriteria = z.object({
  patch_applies: z.boolean(),
  verification_must_pass: z.boolean(),
  required_files_changed: z.array(z.string().min(1)).optional(),
  forbidden_files_changed: z.array(z.string().min(1)).optional(),
  required_output_patterns: z.array(z.string().min(1)).optional(),
  forbidden_output_patterns: z.array(z.string().min(1)).optional(),
}).strict();

const RawBenchmarkScenario = z.object({
  scenario_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  fixture_repo_path: z.string().min(1).optional(),
  goal: z.string().min(1),
  expected_changed_files: z.array(z.string().min(1)),
  forbidden_changed_files: z.array(z.string().min(1)).optional(),
  verification_command_ids: z.array(z.string().min(1)),
  success_criteria: z.union([BenchmarkSuccessCriteria, z.array(z.string().min(1))]),
  max_repair_attempts: z.number().int().min(0).optional(),
  fixture_files: z.record(z.string(), z.string()).optional(),
}).strict();

export const BenchmarkScenario = RawBenchmarkScenario.transform((scenario) => ({
  ...scenario,
  description: scenario.description ?? scenario.title,
  success_criteria: Array.isArray(scenario.success_criteria)
    ? {
        patch_applies: true,
        verification_must_pass: true,
        required_files_changed: scenario.expected_changed_files,
        forbidden_files_changed: scenario.forbidden_changed_files ?? [],
        required_output_patterns: scenario.success_criteria,
        forbidden_output_patterns: [],
      }
    : scenario.success_criteria,
  fixture_files: scenario.fixture_files ?? {},
}));

export type BenchmarkSuccessCriteria = z.infer<typeof BenchmarkSuccessCriteria>;
export type BenchmarkScenario = z.infer<typeof BenchmarkScenario>;

export function benchmarkScenarioRoot(): string {
  let current = process.cwd();
  for (let index = 0; index < 6; index += 1) {
    const candidate = resolve(current, "examples", "evals", "repo-plan-to-patch");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return resolve(process.cwd(), "examples", "evals", "repo-plan-to-patch");
}

export function loadBenchmarkScenarios(root = benchmarkScenarioRoot()): readonly BenchmarkScenario[] {
  if (!existsSync(root)) return builtInScenarios();
  const scenarios = readdirSync(root)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => BenchmarkScenario.parse(JSON.parse(readFileSync(resolve(root, entry), "utf8"))));
  return scenarios.length > 0 ? scenarios : builtInScenarios();
}

export function listBenchmarkScenarios(): readonly Pick<BenchmarkScenario, "scenario_id" | "title" | "goal" | "expected_changed_files">[] {
  return loadBenchmarkScenarios().map((scenario) => ({
    scenario_id: scenario.scenario_id,
    title: scenario.title,
    goal: scenario.goal,
    expected_changed_files: scenario.expected_changed_files,
  }));
}

function builtInScenarios(): readonly BenchmarkScenario[] {
  return [
    BenchmarkScenario.parse({
      scenario_id: "cli-json-status",
      title: "Add JSON output to CLI status",
      description: "Add a JSON output option to a tiny CLI status command.",
      goal: "add json output to my cli status command",
      expected_changed_files: ["src/cli.ts"],
      verification_command_ids: ["npm_run_typecheck"],
      success_criteria: {
        patch_applies: true,
        verification_must_pass: true,
        required_files_changed: ["src/cli.ts"],
        required_output_patterns: ["json", "status"],
      },
      fixture_files: {
        "package.json": "{\"scripts\":{\"typecheck\":\"tsc --noEmit\"},\"devDependencies\":{\"typescript\":\"latest\"}}\n",
        "src/cli.ts": "export function status() { return 'ok'; }\n",
      },
    }),
  ];
}
