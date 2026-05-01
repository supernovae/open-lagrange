import { createPlatformClientFromCurrentProfile } from "@open-lagrange/platform-client";
import { listRunArtifacts, listRuns, recentArtifacts, showArtifact, showRun } from "@open-lagrange/core/artifacts";
import { explainSystem, getCapabilitiesSummary, routeIntent } from "@open-lagrange/core/chat-pack";
import { listDemos, runDemo } from "@open-lagrange/core/demos";
import type { DemoRunResult } from "@open-lagrange/core/demos";
import { inspectPack } from "@open-lagrange/core/packs";
import { runResearchBriefCommand, runResearchExportCommand, runResearchFetchCommand, runResearchSearchCommand } from "@open-lagrange/core/research";
import { buildGeneratedPackFromMarkdown, generateSkillFrame, generateWorkflowSkill, parseSkillfileMarkdown } from "@open-lagrange/core/skills";
import type { TuiUserFrameEvent, UserFrameEvent, UserFrameEventResult } from "@open-lagrange/core/interface";
import { runDoctor } from "@open-lagrange/runtime-manager";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export function useUserFrameEvents(): {
  readonly submitEvent: (event: UserFrameEvent) => Promise<UserFrameEventResult>;
} {
  return {
    submitEvent: async (event) => isTuiEvent(event) ? submitLocalOrRemoteEvent(event) : (await (await createPlatformClientFromCurrentProfile()).submitUserFrameEvent(event)) as UserFrameEventResult,
  };
}

async function submitLocalOrRemoteEvent(event: TuiUserFrameEvent): Promise<UserFrameEventResult> {
  if (event.type === "chat.help") {
    return { status: "completed", message: helpText() };
  }
  if (event.type === "capability.list") {
    const summary = getCapabilitiesSummary();
    return { status: "completed", message: capabilitiesText(summary), output: { capabilities: summary.packs } };
  }
  if (event.type === "pack.list") {
    const summary = getCapabilitiesSummary();
    return { status: "completed", message: packsText(summary), output: { packs: summary.packs, pack_health: summary.pack_health } };
  }
  if (event.type === "demo.list") {
    const demos = listDemos();
    return { status: "completed", message: demosText(demos), output: demos };
  }
  if (event.type === "chat.message") {
    const summary = getCapabilitiesSummary();
    return { status: "completed", message: explainSystem(summary), output: { summary } };
  }
  if (event.type === "intent.classify") {
    const result = routeIntent({ text: event.text });
    return { status: "completed", message: result.message ?? result.flow?.summary ?? "Intent classified.", output: result };
  }
  if (event.type === "doctor.run") return { status: "completed", message: "Doctor checks completed.", output: await runDoctor() };
  if (event.type === "status.show") return { status: "completed", message: "Runtime status loaded.", output: await (await createPlatformClientFromCurrentProfile()).getRuntimeStatus() };
  if (event.type === "pack.inspect") return { status: "completed", message: `Pack inspected: ${event.pack_id}`, output: inspectPack(event.pack_id) ?? { status: "missing", pack_id: event.pack_id } };
  if (event.type === "pack.build") {
    const result = await buildGeneratedPackFromMarkdown({ markdown: await readFile(localPath(event.file), "utf8"), dry_run: event.dry_run });
    return { status: "completed", message: result.message, output: result };
  }
  if (event.type === "skill.frame") {
    const frame = await generateSkillFrame({ skillfile: parseSkillfileMarkdown(await readFile(localPath(event.file), "utf8")) });
    return { status: "completed", message: `Skill framed: ${frame.skill_id}`, output: { frame } };
  }
  if (event.type === "skill.plan") {
    const frame = await generateSkillFrame({ skillfile: parseSkillfileMarkdown(await readFile(localPath(event.file), "utf8")) });
    const workflow = generateWorkflowSkill({ frame });
    return { status: "completed", message: workflow.workflow_skill ? "Workflow Skill generated." : workflow.decision.summary, output: workflow };
  }
  if (event.type === "demo.run") {
    const result = await runDemo({ demo_id: event.demo_id, dry_run: event.dry_run });
    return { status: "completed", message: demoRunMessage(result, event.dry_run) };
  }
  if (event.type === "run.show") {
    if (event.run_id === "list") {
      const runs = [...listRuns()].reverse().slice(0, 20);
      return { status: "completed", message: `Run index loaded: ${runs.length} recent run(s).`, output: runs };
    }
    const run = showRun(event.run_id);
    if (!run) return { status: "failed", message: `Run not found: ${event.run_id}` };
    const output = event.outputs_only
      ? {
        run,
        primary: listRunArtifacts({ run_id: event.run_id, role: "primary_output" }),
        supporting: listRunArtifacts({ run_id: event.run_id, role: "supporting_evidence" }),
      }
      : {
        run,
        primary: listRunArtifacts({ run_id: event.run_id, role: "primary_output" }),
      };
    return { status: "completed", message: event.outputs_only ? `Run outputs loaded: ${run.run_id}` : `Run loaded: ${run.run_id}`, output };
  }
  if (event.type === "artifact.show") {
    if (event.artifact_id === "list") {
      const runs = [...listRuns()].reverse().slice(0, 10);
      const artifacts = recentArtifacts({ limit: 12 });
      return { status: "completed", message: `Recent runs and artifacts loaded: ${runs.length} run(s), ${artifacts.length} artifact(s).`, output: { runs, artifacts } };
    }
    if (event.artifact_id === "recent") {
      const artifacts = recentArtifacts({ limit: 20 });
      return { status: "completed", message: `Recent high-signal artifacts loaded: ${artifacts.length} artifact(s).`, output: artifacts };
    }
    const output = showArtifact(event.artifact_id);
    return { status: output ? "completed" : "failed", message: output ? `Artifact loaded: ${event.artifact_id}` : `Artifact not found: ${event.artifact_id}`, output };
  }
  if (event.type === "research.search") {
    const result = await runResearchSearchCommand({ query: event.query, mode: event.mode });
    return { status: "completed", message: researchMessage("Search", result), output: result };
  }
  if (event.type === "research.fetch") {
    if (event.mode !== "live") return { status: "failed", message: "Research URL fetch requires live mode." };
    const result = await runResearchFetchCommand({ url: event.url, mode: "live" });
    return { status: "completed", message: researchMessage("Fetch", result), output: result };
  }
  if (event.type === "research.brief") {
    const result = await runResearchBriefCommand({ topic: event.topic, mode: event.mode });
    return { status: "completed", message: researchMessage("Brief", result), output: result };
  }
  if (event.type === "research.export") {
    const result = await runResearchExportCommand({ brief_id: event.brief_id });
    return { status: "completed", message: researchMessage("Export", result), output: result };
  }
  return (await (await createPlatformClientFromCurrentProfile()).submitUserFrameEvent(event)) as UserFrameEventResult;
}

function helpText(): string {
  return [
    "Open Lagrange TUI Help",
    "",
    "How input works:",
    "- Type plain language to get a suggested typed flow.",
    "- Use /confirm before workflow-starting suggestions run.",
    "- Commands start with /. Normal letters are chat input, not shortcuts.",
    "",
    "Navigation:",
    "- Up/down: command history",
    "- Page up/down or Shift+up/down: journal scroll",
    "- Tab / Shift+tab: cycle panes",
    "- /expand: open the current transcript card in detail view",
    "- /collapse: return from detail view to the transcript",
    "- /copy: journal the current view text",
    "",
    "Useful commands:",
    "- /status",
    "- /doctor",
    "- /capabilities",
    "- /packs",
    "- /demos",
    "- /plan repo <goal>",
    "- /repo run <goal>",
    "- /skill plan <file>",
    "- /pack build <file>",
    "- /demo run repo-json-output",
    "- /demo run repo-json-output --live",
    "- /research search <query>",
    "- /research brief <topic>",
    "- /research fetch <url> --live",
    "- /run list",
    "- /run outputs latest",
    "- /artifact recent",
    "- /artifact show <artifact_id>",
    "- /approve <approval_id>",
    "- /reject <approval_id>",
    "",
    "Keyboard shortcuts:",
    "- Ctrl+r refresh",
    "- Ctrl+d doctor",
    "- Ctrl+l logs",
    "- Ctrl+s start runtime",
    "- Ctrl+q quit",
  ].join("\n");
}

function researchMessage(title: string, result: { readonly run_id: string; readonly output_dir: string; readonly artifacts: readonly { readonly artifact_id: string; readonly kind: string; readonly title: string }[]; readonly warnings: readonly string[] }): string {
  return [
    `Research ${title} completed`,
    `Run: ${result.run_id}`,
    `Artifacts written to: ${result.output_dir}`,
    result.warnings.length > 0 ? `Warnings: ${result.warnings.join(", ")}` : "Warnings: none",
    "",
    "Artifacts:",
    ...result.artifacts.map((artifact) => `- ${artifact.title} [${artifact.kind}] ${artifact.artifact_id}`),
  ].join("\n");
}

function packsText(summary: ReturnType<typeof getCapabilitiesSummary>): string {
  const lines = [
    "Installed Packs",
    "",
    ...summary.packs.flatMap((pack) => [
      `${pack.pack_id} · ${pack.name}`,
      `- ${pack.description}`,
      `- Capabilities: ${pack.capabilities.length}`,
      `- Inspect: /pack inspect ${pack.pack_id}`,
      "",
    ]),
  ];
  return lines.join("\n").trimEnd();
}

function capabilitiesText(summary: ReturnType<typeof getCapabilitiesSummary>): string {
  const lines = [
    "Capabilities",
    "",
    ...summary.packs.flatMap((pack) => [
      `${pack.pack_id}`,
      ...pack.capabilities.map((capability) => `- ${capability.capability_id}: ${capability.description} (${capability.risk_level}${capability.requires_approval ? ", approval" : ""})`),
      "",
    ]),
  ];
  return lines.join("\n").trimEnd();
}

function demosText(demos: ReturnType<typeof listDemos>): string {
  return [
    "Demos",
    "",
    ...demos.flatMap((demo) => [
      `${demo.demo_id} · ${demo.title}`,
      `- ${demo.summary}`,
      `- Run: /demo run ${demo.demo_id}`,
      ...(demo.demo_id === "repo-json-output" ? ["- Live: /demo run repo-json-output --live"] : []),
      "",
    ]),
  ].join("\n").trimEnd();
}

function isTuiEvent(event: UserFrameEvent | TuiUserFrameEvent): event is TuiUserFrameEvent {
  return typeof event.type === "string" && event.type.includes(".");
}

function localPath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function demoRunMessage(result: DemoRunResult, dryRun: boolean): string {
  const lines = [
    `Demo completed: ${result.demo.demo_id}`,
    `Mode: ${dryRun ? "dry-run preview" : "live local execution"}`,
    `What happened: ${result.demo.summary}`,
    result.output_dir ? `Artifacts written to: ${result.output_dir}` : "Artifacts were generated in memory.",
    "",
    "Artifacts:",
    ...result.artifacts.map((artifact) => `- ${artifact.title} [${artifact.kind}] ${artifact.artifact_id}`),
    "",
    "Try next:",
    result.artifacts[0] ? `/artifact show ${result.artifacts[0].artifact_id}` : "/artifact list",
    "/artifact list",
  ];
  if (result.demo.demo_id === "repo-json-output" && dryRun) {
    lines.push("/demo run repo-json-output --live");
  }
  return lines.join("\n");
}
