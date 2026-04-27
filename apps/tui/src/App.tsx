import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "ink";
import type { UserFrameEvent } from "@open-lagrange/core/interface";
import { buildViewModel } from "./view-model.js";
import { parseUserInput } from "./command-parser.js";
import type { ConversationTurn, PaneId } from "./types.js";
import { useProjectStatus } from "./hooks/useProjectStatus.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";
import { useUserFrameEvents } from "./hooks/useUserFrameEvents.js";
import { Layout } from "./components/Layout.js";

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
  const [selectedPane, setSelectedPane] = useState<PaneId>("timeline");
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [started, setStarted] = useState(false);
  const [lastError, setLastError] = useState<string | undefined>();
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
  }), [status.project, selectedPane, status.isLoading, status.health, status.lastError, lastError, conversation]);

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
    onQuit: () => app.exit(),
  });

  async function dispatch(event: UserFrameEvent): Promise<void> {
    setConversation((turns) => [...turns, userTurn(eventText(event), projectId, activeTask?.task_run_id)]);
    try {
      const result = await submitEvent(event);
      const submittedProjectId = result.status === "submitted" ? result.project_id : undefined;
      const submittedTaskId = result.status === "submitted" ? result.task_run_id : undefined;
      setConversation((turns) => [...turns, systemTurn(result.message, submittedProjectId ?? projectId, submittedTaskId ?? activeTask?.task_run_id)]);
      if (submittedProjectId) setProjectId(submittedProjectId);
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

function eventText(event: UserFrameEvent): string {
  if (event.type === "submit_goal") return event.text;
  if (event.type === "refine_goal" || event.type === "ask_explanation") return event.text;
  if (event.type === "approve") return `approve ${event.task_id}`;
  if (event.type === "reject") return `reject ${event.task_id}`;
  if (event.type === "request_artifact") return `show ${event.artifact_type}`;
  if (event.type === "request_verification") return `verify ${event.command_id}`;
  return "adjust scope";
}
