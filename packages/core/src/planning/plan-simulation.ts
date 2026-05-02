import { z } from "zod";
import { stableHash } from "../util/hash.js";
import { derivePlanRequirements, type RuntimeProfileForRequirements } from "./plan-requirements.js";
import type { PlanValidationResult } from "./plan-errors.js";
import type { Planfile } from "./planfile-schema.js";
import { PlannerQuestion } from "./plan-builder-question.js";

export const PlanSimulationStatus = z.enum(["ready", "needs_input", "missing_requirements", "invalid", "unsafe"]);
export type PlanSimulationStatus = z.infer<typeof PlanSimulationStatus>;

export const PlanSimulationReport = z.object({
  status: PlanSimulationStatus,
  required_packs: z.array(z.string().min(1)),
  required_providers: z.array(z.string().min(1)),
  required_credentials: z.array(z.string().min(1)),
  required_permissions: z.array(z.string().min(1)),
  approval_requirements: z.array(z.string().min(1)),
  predicted_artifacts: z.array(z.string().min(1)),
  estimated_steps: z.number().int().min(0),
  questions: z.array(PlannerQuestion),
  validator_errors: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
}).strict();

export type PlanSimulationReport = z.infer<typeof PlanSimulationReport>;

export function simulatePlanfile(input: {
  readonly planfile: Planfile;
  readonly validation_report?: PlanValidationResult;
  readonly runtime_profile?: RuntimeProfileForRequirements;
  readonly max_questions?: number;
}): PlanSimulationReport {
  const requirements = derivePlanRequirements({ planfile: input.planfile, ...(input.runtime_profile ? { runtime_profile: input.runtime_profile } : {}) });
  const validatorErrors = (input.validation_report?.issues ?? []).filter((issue) => issue.severity === "error").map((issue) => `${issue.code}: ${issue.message}`);
  const questions = planQuestions({ planfile: input.planfile, requirements }).slice(0, input.max_questions ?? 5);
  const unsafe = input.planfile.nodes.some((node) => node.risk_level === "destructive");
  const status: PlanSimulationStatus = validatorErrors.length > 0
    ? "invalid"
    : unsafe
      ? "unsafe"
      : questions.some((question) => question.severity === "blocking" && !question.answer)
        ? "needs_input"
        : requirements.missing_providers.length > 0 || requirements.missing_credentials.length > 0 || requirements.missing_packs.length > 0
          ? "missing_requirements"
          : "ready";
  return PlanSimulationReport.parse({
    status,
    required_packs: requirements.required_packs,
    required_providers: requirements.required_providers,
    required_credentials: requirements.required_credentials,
    required_permissions: requirements.permissions,
    approval_requirements: requirements.approval_requirements,
    predicted_artifacts: [...new Set(input.planfile.nodes.flatMap((node) => node.expected_outputs))].sort(),
    estimated_steps: input.planfile.nodes.length,
    questions,
    validator_errors: validatorErrors,
    warnings: requirements.warnings,
  });
}

function planQuestions(input: { readonly planfile: Planfile; readonly requirements: ReturnType<typeof derivePlanRequirements> }): PlannerQuestion[] {
  const questions: PlannerQuestion[] = [];
  const context = input.planfile.execution_context as Record<string, unknown> | undefined;
  const schedule = context?.schedule_intent as Record<string, unknown> | undefined;
  if (schedule?.requested === true && typeof schedule.time_of_day !== "string") {
    questions.push(question({
      planfile: input.planfile,
      key: "schedule_time",
      severity: "blocking",
      question: "What time of day should this scheduled Planfile use?",
      why_it_matters: "A schedule cannot be saved without an explicit time.",
      default_assumption: "08:00",
      choices: ["08:00", "09:00", "17:00"],
      affected_nodes: input.planfile.nodes.map((node) => node.id),
    }));
  }
  if (input.requirements.missing_providers.includes("search")) {
    questions.push(question({
      planfile: input.planfile,
      key: "search_provider",
      severity: "blocking",
      question: "Which search source should this research Planfile use?",
      why_it_matters: "Topic research requires a configured live search provider or explicit source URLs.",
      default_assumption: "Configure local-searxng or provide --url sources.",
      choices: ["configure local-searxng", "provide URLs", "defer search"],
      affected_nodes: nodesUsing(input.planfile, "research.search_sources"),
    }));
  }
  if (input.planfile.nodes.some((node) => node.risk_level === "external_side_effect")) {
    questions.push(question({
      planfile: input.planfile,
      key: "external_side_effect",
      severity: "clarifying",
      question: "Confirm that this Planfile may request approval for external side effects.",
      why_it_matters: "External side effects need explicit review before execution.",
      default_assumption: "Require approval before execution.",
      choices: ["require approval", "revise to avoid external side effects"],
      affected_nodes: input.planfile.nodes.filter((node) => node.risk_level === "external_side_effect").map((node) => node.id),
    }));
  }
  if (input.planfile.nodes.some((node) => node.risk_level === "destructive")) {
    questions.push(question({
      planfile: input.planfile,
      key: "destructive_action",
      severity: "blocking",
      question: "Confirm the destructive scope or revise the Planfile.",
      why_it_matters: "Destructive actions require explicit user intent and approval.",
      default_assumption: "Revise to avoid destructive actions.",
      choices: ["revise to avoid destructive actions", "explicitly allow destructive scope"],
      affected_nodes: input.planfile.nodes.filter((node) => node.risk_level === "destructive").map((node) => node.id),
    }));
  }
  return questions;
}

function question(input: {
  readonly planfile: Planfile;
  readonly key: string;
  readonly severity: PlannerQuestion["severity"];
  readonly question: string;
  readonly why_it_matters: string;
  readonly default_assumption: string;
  readonly choices: readonly string[];
  readonly affected_nodes: readonly string[];
}): PlannerQuestion {
  return PlannerQuestion.parse({
    question_id: `question_${stableHash({ plan_id: input.planfile.plan_id, key: input.key }).slice(0, 16)}`,
    severity: input.severity,
    question: input.question,
    why_it_matters: input.why_it_matters,
    default_assumption: input.default_assumption,
    choices: [...input.choices],
    affected_nodes: [...input.affected_nodes],
  });
}

function nodesUsing(planfile: Planfile, capabilityRef: string): string[] {
  return planfile.nodes.filter((node) => node.allowed_capability_refs.includes(capabilityRef)).map((node) => node.id);
}
