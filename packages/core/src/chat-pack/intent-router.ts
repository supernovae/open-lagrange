import type { RuntimeHealth } from "../user-frame-events.js";
import { getCapabilitiesSummary } from "./capability-discovery.js";
import {
  flowForDemoRun,
  flowForPlanCompose,
  flowForPackBuild,
  flowForRepositoryPlan,
  flowForRepositoryRun,
  flowForResearchBrief,
  flowForSkillPlan,
  informationalFlow,
  type SuggestedFlow,
  type SuggestedFlowContext,
} from "./suggested-flow.js";

export interface IntentRouteResult {
  readonly kind: "flow" | "multiple" | "message";
  readonly flow?: SuggestedFlow;
  readonly alternatives?: readonly SuggestedFlow[];
  readonly message?: string;
  readonly used_model: boolean;
}

export function routeIntent(input: {
  readonly text: string;
  readonly context?: SuggestedFlowContext;
  readonly health?: RuntimeHealth;
}): IntentRouteResult {
  const text = input.text.trim();
  const lower = text.toLowerCase();
  if (!text) return { kind: "message", message: "Enter a goal or slash command.", used_model: false };

  if (isCapabilityQuestion(lower)) {
    const summary = getCapabilitiesSummary({ ...(input.health ? { health: input.health } : {}) });
    return {
      kind: "flow",
      flow: informationalFlow({
        flow_id: "capabilities",
        title: "Capabilities Summary",
        summary: `Show ${summary.packs.length} installed packs, ${summary.demos.length} demos, and recent artifacts.`,
        command: "/capabilities",
        event: { type: "chat.message", text },
      }),
      used_model: false,
    };
  }

  if (lower.startsWith("why") || lower.startsWith("explain") || lower.startsWith("what happened")) {
    return {
      kind: "flow",
      flow: informationalFlow({
        flow_id: "help",
        title: "Explanation",
        summary: "Explain current status, approval needs, or available context.",
        command: "/help",
        event: { type: "chat.message", text },
      }),
      used_model: false,
    };
  }

  if (lower.includes("doctor") || lower.includes("health")) {
    return { kind: "flow", flow: informationalFlow({ flow_id: "doctor", title: "Runtime Doctor", summary: "Run local or remote runtime checks.", command: "/doctor", event: { type: "doctor.run" } }), used_model: false };
  }
  if (lower.includes("show") && lower.includes("pack")) {
    return { kind: "flow", flow: informationalFlow({ flow_id: "packs", title: "Pack List", summary: "Show registered and installed packs.", command: "/packs", event: { type: "status.show" } }), used_model: false };
  }
  if (lower.includes("demo")) {
    return { kind: "flow", flow: flowForDemoRun(lower.includes("repo") ? "repo-json-output" : "skills-research-brief"), used_model: false };
  }
  if (looksLikeResearchFetch(lower)) {
    return { kind: "flow", flow: flowForPlanCompose(text, input.context), used_model: false };
  }
  if (looksLikeResearchGoal(lower)) {
    return { kind: "flow", flow: flowForPlanCompose(text, input.context), used_model: false };
  }
  if (lower.includes("skill") || lower.includes("skills.md")) {
    const file = extractFile(text) ?? "./skills.md";
    if (lower.includes("pack") || lower.includes("plugin")) return { kind: "flow", flow: flowForPackBuild(file), used_model: false };
    return { kind: "flow", flow: flowForSkillPlan(file), used_model: false };
  }
  if (lower.includes("pack") && looksLikeFile(text)) {
    return { kind: "flow", flow: flowForPackBuild(extractFile(text) ?? "./skills.md"), used_model: false };
  }
  if (lower.startsWith("run ") || lower.includes("apply")) {
    return { kind: "flow", flow: flowForRepositoryRun(cleanGoal(text), input.context), used_model: false };
  }
  if (looksLikeRepoGoal(lower)) {
    return { kind: "flow", flow: flowForPlanCompose(cleanGoal(text), input.context), used_model: false };
  }

  const alternatives = [
    flowForPlanCompose(text, input.context),
    flowForRepositoryPlan(text, input.context),
    flowForPackBuild("./skills.md"),
    flowForResearchBrief(text),
    flowForDemoRun("repo-json-output"),
  ].map((flow) => ({ ...flow, confidence: "low" as const }));
  return {
    kind: "multiple",
    alternatives,
    message: "I found a few possible flows. Choose one by running its slash command.",
    used_model: false,
  };
}

function looksLikeResearchGoal(lower: string): boolean {
  return lower.includes("research ") || lower.includes("cited brief") || lower.includes("briefing") || lower.includes("sources for") || lower.includes("source-backed");
}

function looksLikeResearchFetch(lower: string): boolean {
  return lower.includes("fetch this") || lower.includes("summarize this url") || lower.includes("fetch http") || lower.includes("summarize http");
}

function isCapabilityQuestion(lower: string): boolean {
  return lower.includes("what can you do") || lower.includes("capabilities") || lower.includes("help me") || lower === "help";
}

function looksLikeRepoGoal(lower: string): boolean {
  return [
    "add ",
    "fix ",
    "change ",
    "update ",
    "implement ",
    "refactor ",
    "test ",
    "json output",
    "my cli",
  ].some((marker) => lower.includes(marker));
}

function looksLikeFile(value: string): boolean {
  return /(?:^|\s)[./\w-]+\.(?:md|markdown|yaml|yml|json)(?:\s|$)/.test(value);
}

function extractFile(value: string): string | undefined {
  return value.match(/(?:^|\s)((?:\.\/|\.\.\/|\/)?[\w./-]+\.(?:md|markdown|yaml|yml|json))(?:\s|$)/)?.[1];
}

function cleanGoal(value: string): string {
  return value.replace(/^run\s+/i, "").trim();
}
