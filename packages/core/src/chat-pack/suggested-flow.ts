import { z } from "zod";
import { TuiUserFrameEvent } from "../events/user-frame-event.js";

export const SuggestedFlow = z.object({
  flow_id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  command: z.string().min(1),
  event: TuiUserFrameEvent,
  side_effects: z.array(z.string()),
  required_packs: z.array(z.string()),
  approval: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  requires_confirmation: z.boolean(),
}).strict();

export type SuggestedFlow = z.infer<typeof SuggestedFlow>;

export interface SuggestedFlowContext {
  readonly repo_path?: string;
  readonly approval_id?: string;
  readonly task_id?: string;
}

export function flowForRepositoryPlan(goal: string, context: SuggestedFlowContext = {}): SuggestedFlow {
  return SuggestedFlow.parse({
    flow_id: "repository_plan",
    title: "Repository Planfile",
    summary: "Create a repository Planfile and preview the work before patch execution.",
    command: `/plan repo ${quote(goal)}`,
    event: { type: "plan.create", target: "repo", goal, repo_path: context.repo_path ?? ".", dry_run: true },
    side_effects: ["No file changes until apply."],
    required_packs: ["open-lagrange.repository"],
    approval: "Approval is required before patch execution.",
    confidence: "high",
    requires_confirmation: true,
  });
}

export function flowForRepositoryRun(goal: string, context: SuggestedFlowContext = {}): SuggestedFlow {
  return SuggestedFlow.parse({
    flow_id: "repository_run",
    title: "Repository Run",
    summary: "Run the repository workflow as a dry run unless the plan is later applied.",
    command: `/repo run ${quote(goal)}`,
    event: { type: "repo.run", goal, repo_path: context.repo_path ?? ".", dry_run: true, apply: false },
    side_effects: ["Uses the repository workflow; apply remains gated."],
    required_packs: ["open-lagrange.repository"],
    approval: "Approval is required for write or verification steps.",
    confidence: "high",
    requires_confirmation: true,
  });
}

export function flowForPackBuild(file: string): SuggestedFlow {
  return SuggestedFlow.parse({
    flow_id: "pack_build",
    title: "Skill-to-Pack Build",
    summary: "Generate a reviewable local Capability Pack scaffold from a skill file.",
    command: `/pack build ${file}`,
    event: { type: "pack.build", file, dry_run: true },
    side_effects: ["Writes generated pack artifacts only after confirmation."],
    required_packs: ["open-lagrange.chat"],
    approval: "Install remains explicit after validation.",
    confidence: "high",
    requires_confirmation: true,
  });
}

export function flowForSkillPlan(file: string): SuggestedFlow {
  return SuggestedFlow.parse({
    flow_id: "skill_plan",
    title: "Workflow Skill Plan",
    summary: "Frame the skill file and preview a Planfile-backed Workflow Skill.",
    command: `/skill plan ${file}`,
    event: { type: "skill.plan", file },
    side_effects: ["Read-only preview."],
    required_packs: ["open-lagrange.chat"],
    approval: "No approval required for preview.",
    confidence: "high",
    requires_confirmation: true,
  });
}

export function flowForDemoRun(demoId: string): SuggestedFlow {
  return SuggestedFlow.parse({
    flow_id: "demo_run",
    title: "Demo Run",
    summary: "Run a deterministic dry-run demo and index its artifacts.",
    command: `/demo run ${demoId}`,
    event: { type: "demo.run", demo_id: demoId, dry_run: true },
    side_effects: ["Writes demo artifacts after confirmation."],
    required_packs: ["open-lagrange.chat"],
    approval: "No approval required for dry-run demos.",
    confidence: "high",
    requires_confirmation: true,
  });
}

export function flowForResearchBrief(topic: string): SuggestedFlow {
  return SuggestedFlow.parse({
    flow_id: "research_brief",
    title: "Cited Research Brief",
    summary: "Search fixture sources, extract content, create a source set, and write a cited research brief.",
    command: `/research brief ${quote(topic)} --fixture`,
    event: { type: "research.brief", topic, mode: "fixture" },
    side_effects: ["Writes research artifacts after confirmation."],
    required_packs: ["open-lagrange.research"],
    approval: "Live network fetch is separate and explicit.",
    confidence: "high",
    requires_confirmation: true,
  });
}

export function flowForResearchFetch(url: string): SuggestedFlow {
  return SuggestedFlow.parse({
    flow_id: "research_fetch",
    title: "Fetch Source URL",
    summary: "Fetch one explicit URL through network policy and store source artifacts.",
    command: `/research fetch ${url} --live`,
    event: { type: "research.fetch", url, mode: "live" },
    side_effects: ["Live network read through Research Pack policy."],
    required_packs: ["open-lagrange.research"],
    approval: "No approval by default; network policy still applies.",
    confidence: "high",
    requires_confirmation: true,
  });
}

export function informationalFlow(input: {
  readonly flow_id: string;
  readonly title: string;
  readonly summary: string;
  readonly command: string;
  readonly event: SuggestedFlow["event"];
  readonly confidence?: SuggestedFlow["confidence"];
}): SuggestedFlow {
  return SuggestedFlow.parse({
    flow_id: input.flow_id,
    title: input.title,
    summary: input.summary,
    command: input.command,
    event: input.event,
    side_effects: ["Read-only."],
    required_packs: ["open-lagrange.chat"],
    approval: "No approval required.",
    confidence: input.confidence ?? "high",
    requires_confirmation: false,
  });
}

export function quote(value: string): string {
  return JSON.stringify(value);
}
