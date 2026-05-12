import type { PackRegistry } from "@open-lagrange/capability-sdk";
import { packRegistry as defaultPackRegistry, createCapabilitySnapshotForTask } from "../capability-registry/registry.js";
import type { CapabilitySnapshot } from "../schemas/capabilities.js";
import { stableHash } from "../util/hash.js";
import { deterministicGoalFrame } from "./goal-frame.js";
import { classifyIntent, extractUrl } from "./intent-classifier.js";
import type { IntentFrame } from "./intent-frame.js";
import { matchCapabilitiesForIntent, missingRequiredCapabilities, type CapabilityMatch } from "./capability-match.js";
import { PlanCompositionError } from "./plan-composition-errors.js";
import { createCorePlanTemplateRegistry, type PlanTemplate, type TemplateNode } from "./plan-template-registry.js";
import { deterministicPlanfile } from "./plan-cognition.js";
import { renderPlanfileMarkdown } from "./planfile-markdown.js";
import { Planfile, type Planfile as PlanfileType, type PlanNode } from "./planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "./planfile-validator.js";
import type { PlanValidationResult } from "./plan-errors.js";

export interface RuntimeProfileForComposition {
  readonly name?: string;
  readonly searchProviders?: readonly { readonly id: string; readonly kind: string; readonly enabled?: boolean }[] | undefined;
}

export interface ComposePlanfileFromIntentInput {
  readonly prompt: string;
  readonly runtime_profile?: RuntimeProfileForComposition;
  readonly pack_registry?: PackRegistry;
  readonly capability_snapshot?: CapabilitySnapshot;
  readonly context?: {
    readonly repo_path?: string;
    readonly current_workspace?: string;
    readonly provider_preference?: string;
    readonly schedule_preference?: unknown;
  };
  readonly mode: "dry_run" | "live";
  readonly now?: string;
}

export interface ComposedPlanfile {
  readonly intent_frame: IntentFrame;
  readonly selected_template?: PlanTemplate;
  readonly capability_matches: CapabilityMatch[];
  readonly planfile: PlanfileType;
  readonly markdown: string;
  readonly validation_report: PlanValidationResult;
  readonly warnings: readonly string[];
}

export async function composePlanfileFromIntent(input: ComposePlanfileFromIntentInput): Promise<ComposedPlanfile> {
  const now = input.now ?? new Date().toISOString();
  const registry = input.pack_registry ?? defaultPackRegistry;
  const templates = createCorePlanTemplateRegistry().list();
  const intent = await classifyIntent({ prompt: input.prompt, ...(input.context ? { context: input.context } : {}), templates, now });
  const selected = selectTemplate(intent, templates);
  if (!selected && intent.ambiguity.blocking) {
    throw new PlanCompositionError("Intent needs clarification before a safe Planfile can be composed.", "BLOCKING_AMBIGUITY", { questions: intent.ambiguity.questions });
  }
  const missing = selected ? missingRequiredCapabilities({ registry, template: selected }) : [];
  if (missing.length > 0) {
    throw new PlanCompositionError("Required capabilities are not installed.", "MISSING_CAPABILITY", { missing_capabilities: missing, template_id: selected?.template_id });
  }
  const capabilityMatches = matchCapabilitiesForIntent({ registry, ...(selected ? { template: selected } : {}), required_kinds: intent.required_capability_kinds });
  const warnings = compositionWarnings({ intent, selected, input });
  const plan = withCanonicalPlanDigest(selected
    ? planfileFromTemplate({ intent, template: selected, input, now })
    : deterministicPlanfile(deterministicGoalFrame(input.prompt, now), input.mode === "live" ? "apply" : "dry_run", now));
  const snapshot = input.capability_snapshot ?? createCapabilitySnapshotForTask({ now });
  const validation = validatePlanfile(plan, { capability_snapshot: snapshot });
  const markdown = renderPlanfileMarkdown(plan, {
    dry_run_findings: warnings.length > 0 ? warnings : ["Intent composed into a reviewable Planfile."],
    validation_issues: validation.issues,
  });
  return {
    intent_frame: intent,
    ...(selected ? { selected_template: selected } : {}),
    capability_matches: capabilityMatches,
    planfile: plan,
    markdown,
    validation_report: validation,
    warnings,
  };
}

function selectTemplate(intent: IntentFrame, templates: readonly PlanTemplate[]): PlanTemplate | undefined {
  const candidates = templates
    .map((template) => ({ template, score: templateScore(intent, template) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.template;
}

function templateScore(intent: IntentFrame, template: PlanTemplate): number {
  let score = 0;
  if (template.domains.includes(intent.domain)) score += 4;
  if (template.output_kind === intent.output_expectation?.kind) score += 2;
  const text = `${intent.original_prompt} ${intent.interpreted_goal}`.toLowerCase();
  for (const pattern of template.intent_patterns) if (text.includes(pattern.toLowerCase())) score += 1;
  if (intent.domain === "research" && extractUrl(intent.original_prompt) && template.template_id === "research.url_summary") score += 5;
  if (intent.domain === "research" && !extractUrl(intent.original_prompt) && template.template_id === "research.topic_brief") score += 3;
  if (intent.domain === "repository" && template.template_id === "repository.plan_to_patch") score += 3;
  if (isOutputPrompt(text) && template.template_id.startsWith("output.")) score += 5;
  if (/\bresearch\b/.test(text) && isOutputPrompt(text) && template.template_id === "output.research_packet") score += 3;
  if (/\bdeveloper\b|\bpatch\b|\bhandoff\b/.test(text) && isOutputPrompt(text) && template.template_id === "output.developer_packet") score += 3;
  return score;
}

function planfileFromTemplate(input: {
  readonly intent: IntentFrame;
  readonly template: PlanTemplate;
  readonly input: ComposePlanfileFromIntentInput;
  readonly now: string;
}): PlanfileType {
  const planId = planIdFor(input.intent, input.template);
  const parameters = stripUndefined(templateParameters(input.intent, input.template, input.input)) as Record<string, unknown>;
  const nodes = input.template.nodes_template.map((node) => planNodeFromTemplate(node, parameters, input.input.mode));
  const edges = nodes.flatMap((node) => node.depends_on.map((dependency) => ({ from: dependency, to: node.id, reason: "depends on" })));
  const goalFrame = deterministicGoalFrame(input.intent.original_prompt, input.now);
  return Planfile.parse({
    schema_version: "open-lagrange.plan.v1",
    plan_id: planId,
    goal_frame: {
      ...goalFrame,
      goal_id: input.intent.intent_id,
      interpreted_goal: input.intent.interpreted_goal,
      non_goals: input.intent.non_goals,
      assumptions: input.intent.assumptions,
      ambiguity: input.intent.ambiguity,
      risk_notes: [`Intent risk level: ${input.intent.risk_level}.`],
      suggested_mode: input.input.mode === "live" ? "apply_with_approval" : "dry_run",
    },
    mode: input.input.mode === "live" ? "apply" : "dry_run",
    status: "draft",
    nodes,
    edges,
    approval_policy: { require_approval_for_risks: ["write", "destructive", "external_side_effect"] },
    verification_policy: { allowed_command_ids: input.template.template_id === "repository.plan_to_patch" ? ["npm_run_typecheck"] : [] },
    execution_context: {
      intent: input.intent,
      template: { template_id: input.template.template_id, pack_id: input.template.pack_id, output_kind: input.template.output_kind },
      parameters,
      ...(input.intent.schedule_intent?.requested ? { schedule_intent: input.intent.schedule_intent } : {}),
      ...(input.input.context?.repo_path ? { repository: { repo_root: input.input.context.repo_path } } : {}),
      nodes: stripUndefined(Object.fromEntries(input.template.nodes_template.flatMap((node) => node.input === undefined ? [] : [[node.node_id, { input: resolveParameters(node.input, parameters) }]]))),
    },
    artifact_refs: [],
    created_at: input.now,
    updated_at: input.now,
  });
}

function planNodeFromTemplate(templateNode: TemplateNode, parameters: Record<string, unknown>, mode: ComposePlanfileFromIntentInput["mode"]): PlanNode {
  const risk = riskForNode(templateNode);
  return {
    id: templateNode.node_id,
    kind: templateNode.kind,
    title: templateNode.title,
    objective: templateNode.objective,
    description: templateNode.description,
    depends_on: [...templateNode.depends_on],
    allowed_capability_refs: templateNode.capability_ref ? [templateNode.capability_ref] : [],
    execution_mode: mode === "live" ? "live" : "dry_run",
    expected_outputs: [...templateNode.expected_outputs],
    acceptance_refs: ["acceptance:1"],
    risk_level: risk,
    approval_required: risk === "write" || risk === "destructive" || risk === "external_side_effect",
    status: "pending",
    artifacts: [],
    errors: [],
    ...(templateNode.optional ? { optional: true } : {}),
    ...(templateNode.kind === "verify" ? { verification_command_ids: ["npm_run_typecheck"] } : {}),
  };
}

function templateParameters(intent: IntentFrame, template: PlanTemplate, input: ComposePlanfileFromIntentInput): Record<string, unknown> {
  const url = extractUrl(intent.original_prompt);
  const topic = cleanTopic(intent.original_prompt, url);
  return {
    topic,
    objective: intent.interpreted_goal,
    title: intent.output_expectation?.kind === "markdown_brief" ? `Research Brief: ${topic}` : intent.interpreted_goal,
    url,
    urls: url ? [url] : [],
    provider_id: input.context?.provider_preference,
    max_sources: 5,
    brief_style: "standard",
    repo_path: input.context?.repo_path,
    template_id: template.template_id,
  };
}

function resolveParameters(value: unknown, parameters: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    const exact = /^\$parameters\.(.+)$/.exec(value);
    if (exact) return parameters[exact[1] ?? ""];
    return value.replace(/\{\{parameters\.([^}]+)\}\}/g, (_match, key: string) => String(parameters[key] ?? ""));
  }
  if (Array.isArray(value)) return value.map((item) => resolveParameters(item, parameters));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveParameters(item, parameters)]));
  }
  return value;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripUndefined(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, unknown] => entry[1] !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)]));
  }
  return value;
}

function compositionWarnings(input: {
  readonly intent: IntentFrame;
  readonly selected: PlanTemplate | undefined;
  readonly input: ComposePlanfileFromIntentInput;
}): string[] {
  const warnings: string[] = [];
  if (input.selected?.template_id === "research.topic_brief" && !hasSearchProvider(input.input.runtime_profile) && !input.input.context?.provider_preference) {
    warnings.push("SEARCH_PROVIDER_NOT_CONFIGURED: configure a live search provider, provide explicit URLs, or use explicit fixture mode for deterministic demos.");
  }
  if (input.intent.schedule_intent?.requested) {
    warnings.push("Schedule intent captured. Automatic timed execution is not created until an explicit schedule command is confirmed.");
  }
  return warnings;
}

function hasSearchProvider(profile: RuntimeProfileForComposition | undefined): boolean {
  return Boolean(profile?.searchProviders?.some((provider) => provider.enabled !== false && provider.kind !== "fixture"));
}

function riskForNode(node: TemplateNode): PlanNode["risk_level"] {
  if (node.kind === "patch") return "write";
  if (node.kind === "verify") return "external_side_effect";
  return "read";
}

function cleanTopic(prompt: string, url: string | undefined): string {
  const withoutUrl = url ? prompt.replace(url, "") : prompt;
  return withoutUrl
    .replace(/^research\s+/i, "")
    .replace(/^summarize\s+/i, "")
    .replace(/^make\s+me\s+a\s+/i, "")
    .replace(/^create\s+a\s+/i, "")
    .replace(/\bevery morning\b/gi, "")
    .replace(/\bdaily\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || prompt;
}

function isOutputPrompt(text: string): boolean {
  return /\b(pdf|html|export|bundle|packet|digest|executive summary|developer handoff|report)\b/.test(text);
}

function planIdFor(intent: IntentFrame, template: PlanTemplate): string {
  const prefix = template.template_id.startsWith("repository.") ? "repo_plan" : "plan";
  return `${prefix}_${stableHash({ intent_id: intent.intent_id, template_id: template.template_id }).slice(0, 18)}`;
}
