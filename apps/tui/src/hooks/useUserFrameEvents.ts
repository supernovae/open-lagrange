import { createPlatformClientFromCurrentProfile } from "@open-lagrange/platform-client";
import { listRunArtifacts, listRuns, recentArtifacts, showArtifact, showRun } from "@open-lagrange/core/artifacts";
import { explainSystem, getCapabilitiesSummary, routeIntent } from "@open-lagrange/core/chat-pack";
import { listDemos, runDemo } from "@open-lagrange/core/demos";
import type { DemoRunResult } from "@open-lagrange/core/demos";
import { inspectPack } from "@open-lagrange/core/packs";
import { composePlanfileFromIntent, derivePlanRequirements, listPlanLibrary, listScheduleRecords, parsePlanfileMarkdown, parsePlanfileYaml, validatePlanfile, withCanonicalPlanDigest } from "@open-lagrange/core/planning";
import { runResearchBriefCommand, runResearchExportCommand, runResearchFetchCommand, runResearchSearchCommand, runResearchSummarizeUrlCommand, type ResearchCommandResult } from "@open-lagrange/core/research";
import { buildGeneratedPackFromMarkdown, generateSkillFrame, generateWorkflowSkill, parseSkillfileMarkdown } from "@open-lagrange/core/skills";
import type { TuiUserFrameEvent, UserFrameEvent, UserFrameEventResult } from "@open-lagrange/core/interface";
import { runDoctor } from "@open-lagrange/runtime-manager";
import { getCurrentProfile } from "@open-lagrange/runtime-manager";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

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
  if (event.type === "plan.compose") {
    const profile = await getCurrentProfile().catch(() => undefined);
    const composed = await composePlanfileFromIntent({
      prompt: event.prompt,
      ...(profile ? { runtime_profile: profile } : {}),
      mode: "dry_run",
      context: {
        ...(event.repo_path ? { repo_path: localPath(event.repo_path) } : {}),
        ...(event.provider_id ? { provider_preference: event.provider_id } : {}),
      },
    });
    if (event.write) {
      const path = join(".open-lagrange", "plans", `${composed.planfile.plan_id}.plan.md`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, composed.markdown, "utf8");
      return { status: "completed", message: planComposeMessage(composed, path), output: { ...composed, path } };
    }
    return { status: "completed", message: planComposeMessage(composed), output: composed };
  }
  if (event.type === "plan.check") {
    const planfile = withCanonicalPlanDigest(await loadLocalPlanfile(event.planfile));
    const profile = await getCurrentProfile().catch(() => undefined);
    const validation = validatePlanfile(planfile);
    const requirements = derivePlanRequirements({ planfile, ...(profile ? { runtime_profile: profile } : {}) });
    return {
      status: validation.ok && !hasMissingRequirements(requirements) ? "completed" : "failed",
      message: planCheckMessage(planfile.plan_id, validation.ok, requirements),
      output: { validation, requirements },
    };
  }
  if (event.type === "plan.library") {
    const plans = listPlanLibrary();
    return { status: "completed", message: planLibraryMessage(plans), output: { plans } };
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
  if (event.type === "provider.list") {
    const profile = await getCurrentProfile().catch(() => undefined);
    const searchProviders = profile?.searchProviders ?? [];
    return {
      status: "completed",
      message: [
        "Providers",
        "",
        `Profile: ${profile?.name ?? "unknown"}`,
        `Active model provider: ${profile?.activeModelProvider ?? "not configured"}`,
        `Model providers: ${Object.keys(profile?.modelProviders ?? {}).join(", ") || "none"}`,
        `Search providers: ${["manual-urls", ...searchProviders.map((provider) => provider.id)].join(", ")}`,
      ].join("\n"),
      output: { profile: profile?.name, active_model_provider: profile?.activeModelProvider, search_providers: searchProviders },
    };
  }
  if (event.type === "schedule.list") {
    const schedules = listScheduleRecords();
    return { status: "completed", message: `Schedules loaded: ${schedules.length} record(s).`, output: { schedules } };
  }
  if (event.type === "research.providers") {
    const providers = await currentSearchProviderConfigs();
    return {
      status: "completed",
      message: `Search providers loaded: ${providers.length + 1} provider(s).`,
      output: {
        providers: [
          { id: "manual-urls", kind: "manual_urls", mode: "live", configured: true },
          ...providers.map((provider) => ({ id: provider.id, kind: provider.kind, mode: "live", configured: provider.enabled !== false })),
        ],
      },
    };
  }
  if (event.type === "research.search") {
    const result = await runResearchSearchCommand({
      query: event.query,
      mode: event.mode,
      ...(event.provider_id ? { provider_id: event.provider_id } : {}),
      search_provider_configs: await currentSearchProviderConfigs(),
      dry_run: event.dry_run,
    });
    return { status: researchStatus(result), message: researchMessage("Search", result), output: result };
  }
  if (event.type === "research.fetch") {
    const result = await runResearchFetchCommand({ url: event.url, mode: event.mode, search_provider_configs: await currentSearchProviderConfigs(), dry_run: event.dry_run });
    return { status: researchStatus(result), message: researchMessage("Fetch", result), output: result };
  }
  if (event.type === "research.summarize_url") {
    const result = await runResearchSummarizeUrlCommand({ url: event.url, mode: event.mode, search_provider_configs: await currentSearchProviderConfigs(), dry_run: event.dry_run });
    return { status: researchStatus(result), message: researchMessage("Summarize URL", result), output: result };
  }
  if (event.type === "research.brief") {
    const result = await runResearchBriefCommand({
      topic: event.topic,
      mode: event.mode,
      ...(event.provider_id ? { provider_id: event.provider_id } : {}),
      search_provider_configs: await currentSearchProviderConfigs(),
      urls: event.urls,
      dry_run: event.dry_run,
    });
    return { status: researchStatus(result), message: researchMessage("Brief", result), output: result };
  }
  if (event.type === "research.export") {
    const result = await runResearchExportCommand({ brief_id: event.brief_id });
    return { status: researchStatus(result), message: researchMessage("Export", result), output: result };
  }
  return (await (await createPlatformClientFromCurrentProfile()).submitUserFrameEvent(event)) as UserFrameEventResult;
}

async function currentSearchProviderConfigs() {
  const profile = await getCurrentProfile().catch(() => undefined);
  return profile?.searchProviders ?? [];
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
    "- Ctrl+e or /expand: open the current transcript card in detail view",
    "- Ctrl+e or /collapse: return from detail view to the transcript",
    "- /copy: journal the current view text",
    "",
    "Useful commands:",
    "- /status",
    "- /doctor",
    "- /compose <goal>",
    "- /check <planfile>",
    "- /library",
    "- /providers",
    "- /artifacts",
    "- /schedule",
    "- /packs",
    "- /capabilities",
    "- /demos",
    "- /plan compose <goal>",
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

function planComposeMessage(result: Awaited<ReturnType<typeof composePlanfileFromIntent>>, path?: string): string {
  const intent = result.intent_frame;
  const schedule = intent.schedule_intent?.requested
    ? `Schedule: ${intent.schedule_intent.cadence ?? "requested"}${intent.schedule_intent.time_of_day ? ` at ${intent.schedule_intent.time_of_day}` : " (time needs confirmation)"}`
    : "Schedule: none";
  const steps = result.planfile.nodes.map((node) => node.title).join(" -> ");
  return [
    "Planfile composed",
    "",
    "Interpreted intent:",
    `Domain: ${intent.domain}`,
    `Output: ${intent.output_expectation?.kind ?? "unknown"}`,
    providerLine(result),
    schedule,
    "",
    `Selected template: ${result.selected_template?.template_id ?? "generic"}`,
    `Plan: ${steps}`,
    `Side effects: ${intent.side_effect_expectation}`,
    `Validation: ${result.validation_report.ok ? "passed" : "failed"}`,
    ...(path ? [`Path: ${path}`] : []),
    ...(result.warnings.length > 0 ? ["", "Warnings:", ...result.warnings.map((warning) => `- ${warning}`)] : []),
    "",
    "Next: validate, edit, run now, save, or create a schedule from the Planfile.",
  ].join("\n");
}

function providerLine(result: Awaited<ReturnType<typeof composePlanfileFromIntent>>): string {
  if (result.intent_frame.domain !== "research") return "Provider: not required";
  const parameterRecord = result.planfile.execution_context?.parameters;
  const provider = parameterRecord && typeof parameterRecord === "object" ? (parameterRecord as Record<string, unknown>).provider_id : undefined;
  return `Provider: ${typeof provider === "string" && provider.length > 0 ? provider : result.warnings.some((warning) => warning.includes("SEARCH_PROVIDER_NOT_CONFIGURED")) ? "not configured" : "configured"}`;
}

async function loadLocalPlanfile(path: string) {
  const local = localPath(path);
  const text = await readFile(local, "utf8");
  return local.endsWith(".yaml") || local.endsWith(".yml") ? parsePlanfileYaml(text) : parsePlanfileMarkdown(text);
}

function hasMissingRequirements(report: ReturnType<typeof derivePlanRequirements>): boolean {
  return report.missing_packs.length > 0
    || report.missing_providers.length > 0
    || report.missing_credentials.length > 0
    || report.missing_permissions.length > 0;
}

function planCheckMessage(planId: string, validationOk: boolean, requirements: ReturnType<typeof derivePlanRequirements>): string {
  return [
    `Plan check: ${planId}`,
    `Validation: ${validationOk ? "passed" : "failed"}`,
    `Portability: ${requirements.portability_level}`,
    `Required packs: ${lineList(requirements.required_packs)}`,
    `Required providers: ${lineList(requirements.required_providers)}`,
    `Missing providers: ${lineList(requirements.missing_providers)}`,
    `Approvals: ${lineList(requirements.approval_requirements)}`,
    `Side effects: ${lineList(requirements.side_effects)}`,
    ...(requirements.suggested_commands.length > 0 ? ["", "Suggested commands:", ...requirements.suggested_commands.map((command) => `- ${command}`)] : []),
  ].join("\n");
}

function planLibraryMessage(plans: ReturnType<typeof listPlanLibrary>): string {
  return [
    `Plan Library: ${plans.length} plan(s)`,
    "",
    ...plans.map((plan) => `- ${plan.name}${plan.plan_id ? ` (${plan.plan_id})` : ""}: ${plan.path}`),
    ...(plans.length === 0 ? ["No local Planfiles found in .open-lagrange/plans or ~/.open-lagrange/plans."] : []),
  ].join("\n");
}

function lineList(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

export function researchStatus(result: ResearchCommandResult): "completed" | "failed" {
  return resultStatus(result.result) === "failed" ? "failed" : "completed";
}

export function researchMessage(title: string, result: ResearchCommandResult): string {
  const status = resultStatus(result.result);
  const error = firstStructuredError(result.result);
  return [
    `Research ${title} ${status}`,
    ...(error ? [`Error: ${error.message}`, `Code: ${error.code}`] : []),
    `Run: ${result.run_id}`,
    `Artifacts written to: ${result.output_dir}`,
    result.warnings.length > 0 ? `Warnings: ${result.warnings.join(", ")}` : "Warnings: none",
    "",
    "Artifacts:",
    ...result.artifacts.map((artifact) => `- ${artifact.title} [${artifact.kind}] ${artifact.artifact_id}`),
  ].join("\n");
}

function resultStatus(result: unknown): "completed" | "failed" {
  if (!result || typeof result !== "object") return "completed";
  const status = (result as { readonly status?: unknown }).status;
  if (typeof status !== "string") return "completed";
  return status === "success" || status === "completed" ? "completed" : "failed";
}

function firstStructuredError(result: unknown): { readonly code: string; readonly message: string } | undefined {
  if (!result || typeof result !== "object") return undefined;
  const errors = (result as { readonly structured_errors?: unknown }).structured_errors;
  if (!Array.isArray(errors)) return undefined;
  const first = errors.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const code = typeof first?.code === "string" ? first.code : undefined;
  const message = typeof first?.message === "string" ? first.message : undefined;
  return code && message ? { code, message } : undefined;
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
