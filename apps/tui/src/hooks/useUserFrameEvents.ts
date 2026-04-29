import { createPlatformClientFromCurrentProfile } from "@open-lagrange/platform-client";
import { buildGeneratedPackFromMarkdown, explainSystem, generateSkillFrame, generateWorkflowSkill, getCapabilitiesSummary, inspectPack, listArtifacts, parseSkillfileMarkdown, routeIntent, runDemo, showArtifact } from "@open-lagrange/core";
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
    return { status: "completed", message: `Demo completed: ${event.demo_id}`, output: result };
  }
  if (event.type === "artifact.show") {
    const output = event.artifact_id === "list" ? listArtifacts() : showArtifact(event.artifact_id);
    return { status: output ? "completed" : "failed", message: output ? "Artifact loaded." : `Artifact not found: ${event.artifact_id}`, output };
  }
  return (await (await createPlatformClientFromCurrentProfile()).submitUserFrameEvent(event)) as UserFrameEventResult;
}

function isTuiEvent(event: UserFrameEvent | TuiUserFrameEvent): event is TuiUserFrameEvent {
  return typeof event.type === "string" && event.type.includes(".");
}

function localPath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}
