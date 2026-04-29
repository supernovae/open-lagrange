import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "ink";
import type { SuggestedFlow, TuiUserFrameEvent, UserFrameEvent } from "@open-lagrange/core/interface";
import { buildViewModel } from "./view-model.js";
import { parseUserInput } from "./command-parser.js";
import { suggestionText } from "./input-router.js";
import type { ConversationTurn, PaneId } from "./types.js";
import { useProjectStatus } from "./hooks/useProjectStatus.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";
import { useUserFrameEvents } from "./hooks/useUserFrameEvents.js";
import { Layout } from "./components/Layout.js";
import { runDoctor, startLocalRuntime, tailLogs } from "@open-lagrange/runtime-manager";

export interface AppProps {
  readonly goal?: string;
  readonly repo?: string;
  readonly projectId?: string;
  readonly workspaceId?: string;
  readonly apply?: boolean;
  readonly dryRun?: boolean;
  readonly pollIntervalMs: number;
  readonly apiUrl?: string;
}

export function App(props: AppProps): React.ReactElement {
  const app = useApp();
  const [projectId, setProjectId] = useState<string | undefined>(props.projectId);
  const [selectedPane, setSelectedPane] = useState<PaneId>("home");
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [started, setStarted] = useState(false);
  const [lastError, setLastError] = useState<string | undefined>();
  const [pendingFlow, setPendingFlow] = useState<SuggestedFlow | undefined>();
  const { submitEvent } = useUserFrameEvents();
  const status = useProjectStatus({ ...(projectId ? { projectId } : {}), pollIntervalMs: props.pollIntervalMs, ...(props.apiUrl ? { apiUrl: props.apiUrl } : {}) });

  const activeTask = status.project?.task_statuses[0];
  const activeApproval = activeTask?.result?.approval_request ?? activeTask?.repository_status?.approval_request;

  const model = useMemo(() => buildViewModel({
    ...(status.project ? { project: status.project } : {}),
    selectedPane,
    inputMode: "chat",
    isLoading: status.isLoading,
    ...(status.health ? { health: status.health } : {}),
    ...(lastError ?? status.lastError ? { lastError: lastError ?? status.lastError } : {}),
    conversation,
    ...(pendingFlow ? { pendingFlow } : {}),
  }), [status.project, selectedPane, status.isLoading, status.health, status.lastError, lastError, conversation, pendingFlow]);

  useEffect(() => {
    if (started || !props.goal) return;
    setStarted(true);
    void dispatch({
      type: "submit_goal",
      text: props.goal,
      ...(props.repo ? { repo_path: props.repo } : {}),
      ...(props.workspaceId ? { workspace_id: props.workspaceId } : {}),
      dry_run: props.dryRun ?? !props.apply,
      apply: props.apply ?? false,
    });
  }, [started, props.goal, props.repo, props.workspaceId, props.dryRun, props.apply]);

  useKeyboardShortcuts({
    selectedPane,
    setSelectedPane,
    onApprove: () => setInput("/approve Approved from TUI."),
    onReject: () => setInput("/reject Rejected from TUI."),
    onRefresh: () => void status.refresh(),
    onStartRuntime: () => void runtimeAction("Starting local runtime.", async () => JSON.stringify(await startLocalRuntime(), null, 2)),
    onDoctor: () => void runtimeAction("Running doctor.", async () => JSON.stringify(await runDoctor(), null, 2)),
    onLogs: () => void runtimeAction("Loading local logs.", async () => await tailLogs()),
    onProfile: () => setInput("/profile use "),
    onQuit: () => app.exit(),
  });

  async function runtimeAction(label: string, action: () => Promise<string>): Promise<void> {
    setConversation((turns) => [...turns, systemTurn(label, projectId, activeTask?.task_run_id)]);
    try {
      const output = await action();
      setConversation((turns) => [...turns, systemTurn(output.slice(0, 4000), projectId, activeTask?.task_run_id)]);
      await status.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Runtime action failed.";
      setLastError(message);
      setConversation((turns) => [...turns, systemTurn(message, projectId, activeTask?.task_run_id)]);
    }
  }

  async function dispatch(event: UserFrameEvent | TuiUserFrameEvent): Promise<void> {
    setConversation((turns) => [...turns, userTurn(eventText(event), projectId, activeTask?.task_run_id)]);
    try {
      const result = await submitEvent(event);
      const submittedProjectId = result.status === "submitted" ? result.project_id : undefined;
      const submittedTaskId = result.status === "submitted" ? result.task_run_id : undefined;
      setConversation((turns) => [...turns, systemTurn(result.message, submittedProjectId ?? projectId, submittedTaskId ?? activeTask?.task_run_id)]);
      if (submittedProjectId) setProjectId(submittedProjectId);
      setPendingFlow(undefined);
      setLastError(undefined);
      await status.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "User frame event failed.";
      setLastError(message);
      setConversation((turns) => [...turns, systemTurn(message, projectId, activeTask?.task_run_id)]);
    }
  }

  async function onSubmit(value: string): Promise<void> {
    const parsed = parseUserInput(value, {
      ...(projectId ? { project_id: projectId } : {}),
      ...(activeTask ? { task_id: activeTask.task_run_id } : {}),
      ...(activeApproval ? { approval_request_id: activeApproval.approval_request_id } : {}),
      ...(props.repo ? { repo_path: props.repo } : {}),
      ...(props.workspaceId ? { workspace_id: props.workspaceId } : {}),
      ...(pendingFlow ? { pendingFlow } : {}),
      dry_run: props.dryRun ?? !props.apply,
    });
    setInput("");
    if (parsed.kind === "empty") return;
    if (parsed.kind === "command" && parsed.quit) {
      app.exit();
      return;
    }
    if (parsed.kind === "command" && parsed.pane) setSelectedPane(parsed.pane);
    if (parsed.kind === "command" && parsed.attachProjectId) {
      setProjectId(parsed.attachProjectId);
      setConversation((turns) => [...turns, systemTurn(`Attached to ${parsed.attachProjectId}.`, parsed.attachProjectId)]);
      setLastError(undefined);
      return;
    }
    if (parsed.kind === "command" && parsed.error) {
      setLastError(parsed.error);
      return;
    }
    if (parsed.kind === "suggestion") {
      setPendingFlow(parsed.flow);
      setSelectedPane("home");
      setConversation((turns) => [...turns, userTurn(value, projectId, activeTask?.task_run_id), systemTurn(suggestionText(parsed.flow), projectId, activeTask?.task_run_id)]);
      setLastError(undefined);
      return;
    }
    if (parsed.kind === "suggestions") {
      const [first] = parsed.flows;
      setPendingFlow(first);
      setSelectedPane("home");
      setConversation((turns) => [...turns, userTurn(value, projectId, activeTask?.task_run_id), systemTurn(`${parsed.message}\n${parsed.flows.map((flow) => `- ${flow.command}`).join("\n")}`, projectId, activeTask?.task_run_id)]);
      setLastError(undefined);
      return;
    }
    if (parsed.event) await dispatch(parsed.event);
  }

  return <Layout model={model} input={input} setInput={setInput} onSubmit={(value) => void onSubmit(value)} />;
}

function userTurn(text: string, project_id?: string, task_id?: string): ConversationTurn {
  return { turn_id: `turn-user-${Date.now()}`, role: "user", text, created_at: new Date().toISOString(), ...(project_id ? { project_id } : {}), ...(task_id ? { task_id } : {}) };
}

function systemTurn(text: string, project_id?: string, task_id?: string): ConversationTurn {
  return { turn_id: `turn-system-${Date.now()}`, role: "system", text, created_at: new Date().toISOString(), ...(project_id ? { project_id } : {}), ...(task_id ? { task_id } : {}) };
}

function eventText(event: UserFrameEvent | TuiUserFrameEvent): string {
  if (event.type === "chat.message" || event.type === "intent.classify") return event.text;
  if (event.type === "plan.create") return event.goal;
  if (event.type === "repo.run") return event.goal;
  if (event.type === "skill.frame" || event.type === "skill.plan" || event.type === "pack.build") return `${event.type} ${event.file}`;
  if (event.type === "pack.inspect") return `inspect ${event.pack_id}`;
  if (event.type === "demo.run") return `run demo ${event.demo_id}`;
  if (event.type === "artifact.show") return `show artifact ${event.artifact_id}`;
  if (event.type === "approval.approve") return `approve ${event.approval_id}`;
  if (event.type === "approval.reject") return `reject ${event.approval_id}`;
  if (event.type === "doctor.run" || event.type === "status.show") return event.type;
  if (event.type === "plan.apply") return `apply ${event.planfile}`;
  if (event.type === "submit_goal") return event.text;
  if (event.type === "refine_goal" || event.type === "ask_explanation") return event.text;
  if (event.type === "approve") return `approve ${event.task_id}`;
  if (event.type === "reject") return `reject ${event.task_id}`;
  if (event.type === "request_artifact") return `show ${event.artifact_type}`;
  if (event.type === "request_verification") return `verify ${event.command_id}`;
  return "adjust scope";
}
