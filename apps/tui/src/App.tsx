import React, { useEffect, useMemo, useState } from "react";
import { useApp, useInput } from "ink";
import type { SuggestedFlow, TuiUserFrameEvent, UserFrameEvent } from "@open-lagrange/core/interface";
import { buildViewModel } from "./view-model.js";
import { parseUserInput } from "./command-parser.js";
import { suggestionText } from "./input-router.js";
import type { ConversationTurn, PaneId, PlanLibraryViewSummary } from "./types.js";
import { useProjectStatus } from "./hooks/useProjectStatus.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";
import { useUserFrameEvents } from "./hooks/useUserFrameEvents.js";
import { Layout } from "./components/Layout.js";
import { runDoctor, startLocalRuntime, tailLogs } from "@open-lagrange/runtime-manager";
import { applyRunEventToSnapshot, type RunEvent, type RunSnapshot } from "@open-lagrange/core/runs";
import { createPlatformClientFromCurrentProfile } from "@open-lagrange/platform-client";
import type { RunConnectionState } from "./types.js";
import type { ActiveObject } from "./state/active-object.js";

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
  const [conversation, setConversation] = useState<ConversationTurn[]>([welcomeTurn()]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | undefined>();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [expandedTurnId, setExpandedTurnId] = useState<string | undefined>();
  const [started, setStarted] = useState(false);
  const [seenStatusError, setSeenStatusError] = useState<string | undefined>();
  const [pendingFlow, setPendingFlow] = useState<SuggestedFlow | undefined>();
  const [runSnapshot, setRunSnapshot] = useState<RunSnapshot | undefined>();
  const [planLibrary, setPlanLibrary] = useState<PlanLibraryViewSummary | undefined>();
  const [runConnectionState, setRunConnectionState] = useState<RunConnectionState>("disconnected");
  const [activeObject, setActiveObject] = useState<ActiveObject | undefined>();
  const { submitEvent } = useUserFrameEvents();
  const status = useProjectStatus({ ...(projectId ? { projectId } : {}), pollIntervalMs: props.pollIntervalMs, ...(props.apiUrl ? { apiUrl: props.apiUrl } : {}) });

  const activeTask = status.project?.task_statuses[0];
  const activeApproval = activeTask?.result?.approval_request ?? activeTask?.repository_status?.approval_request;

  const model = useMemo(() => buildViewModel({
    ...(status.project ? { project: status.project } : {}),
    selectedPane,
    scrollOffset,
    inputMode: "chat",
    isLoading: status.isLoading,
    ...(status.health ? { health: status.health } : {}),
    ...(status.lastError ? { lastError: status.lastError } : {}),
    conversation,
    ...(pendingFlow ? { pendingFlow } : {}),
    ...(runSnapshot ? { run: runSnapshot } : {}),
    ...(planLibrary ? { planLibrary } : {}),
    runConnectionState,
    ...(activeObject ? { activeObject } : {}),
    ...(expandedTurnId ? { expandedTurnId } : {}),
  }), [status.project, selectedPane, scrollOffset, status.isLoading, status.health, status.lastError, conversation, pendingFlow, runSnapshot, planLibrary, runConnectionState, activeObject, expandedTurnId]);

  useEffect(() => {
    if (!status.lastError) {
      setSeenStatusError(undefined);
      return;
    }
    if (status.lastError === seenStatusError) return;
    setSeenStatusError(status.lastError);
    appendTurn(errorTurn(status.lastError, projectId, activeTask?.task_run_id, "Runtime status error"));
  }, [status.lastError, seenStatusError, projectId, activeTask?.task_run_id]);

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

  useEffect(() => {
    if (!runSnapshot?.run_id) {
      setRunConnectionState("disconnected");
      return;
    }
    const controller = new AbortController();
    const runId = runSnapshot.run_id;
    let latestEventId = runSnapshot.timeline.at(-1)?.event_id;
    void (async () => {
      const client = await createPlatformClientFromCurrentProfile();
      setRunConnectionState("connected");
      await client.streamRunEvents(runId, {
        ...(latestEventId ? { afterEventId: latestEventId } : {}),
        signal: controller.signal,
        onEvent: async (envelope) => {
          latestEventId = envelope.event_id;
          setRunConnectionState("connected");
          setRunSnapshot((current) => current ? applyRunEventToSnapshot(current, envelope.event as RunEvent) : current);
          const snapshot = await client.getRunSnapshot(runId) as RunSnapshot;
          if (!controller.signal.aborted) setRunSnapshot(snapshot);
        },
        onError: async () => {
          if (!controller.signal.aborted) setRunConnectionState("reconnecting");
        },
        onReconnect: async (attempt) => {
          if (controller.signal.aborted) return;
          setRunConnectionState(attempt >= 3 ? "polling fallback" : "reconnecting");
          if (attempt >= 3) setRunSnapshot(await client.getRunSnapshot(runId) as RunSnapshot);
        },
      });
    })().catch((error) => {
      if (!controller.signal.aborted) {
        setRunConnectionState("polling fallback");
        appendTurn(errorTurn(error instanceof Error ? error.message : "Run event stream failed.", projectId, activeTask?.task_run_id, "Run stream"));
      }
    });
    return () => {
      controller.abort();
      setRunConnectionState("disconnected");
    };
  }, [runSnapshot?.run_id]);

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

  useInput((value, key) => {
    if (key.ctrl && value === "e") {
      toggleExpandedTurn();
      return;
    }
    if (selectedPane === "run" && input.length === 0) {
      if (value === "a") { setActiveObject({ type: "approval", id: "approvals" }); return; }
      if (value === "f") { setActiveObject({ type: "artifact", id: "artifacts" }); return; }
      if (value === "m") { setActiveObject({ type: "model_call", id: "model_calls" }); return; }
      if (value === "o") { setActiveObject({ type: "output", id: "output" }); return; }
      if (value === "d") { setInput(runSnapshot ? `/output digest --run ${runSnapshot.run_id}` : "/output digest --run "); return; }
      if (value === "x") { setInput(runSnapshot ? `/output export --run ${runSnapshot.run_id} --preset final_outputs --format directory --output ./out` : "/output export --run "); return; }
      if (value === "h") { setInput(runSnapshot ? `/output render-html ` : "/output render-html "); return; }
      if (value === "l") { setActiveObject({ type: "logs", id: "logs" }); return; }
      if (value === "p") { setActiveObject({ type: "plan", id: "plan" }); return; }
      if (value === "r") { setInput(runSnapshot?.active_node_id ? `/run retry ${runSnapshot.run_id} ${runSnapshot.active_node_id} --mode ` : runSnapshot ? `/run resume ${runSnapshot.run_id}` : "/run resume "); return; }
      if (value === "e") { setInput(runSnapshot ? `/run explain ${runSnapshot.run_id}` : "/run explain "); return; }
      if (value === "q") { setSelectedPane("home"); return; }
    }
    if (selectedPane === "repository" && input.length === 0) {
      if (value === "g") { setInput("/repo explain"); return; }
      if (value === "e") { setInput("/repo evidence"); return; }
      if (value === "p") { setSelectedPane("plan"); return; }
      if (value === "d") { setSelectedPane("diff"); return; }
      if (value === "v") { setSelectedPane("verification"); return; }
      if (value === "r") { setInput(runSnapshot?.active_node_id ? `/run retry ${runSnapshot.run_id} ${runSnapshot.active_node_id} --mode ` : "/repo explain"); return; }
      if (value === "s") { setSelectedPane("approvals"); return; }
      if (value === "m") { setActiveObject({ type: "model_call", id: "model_calls" }); return; }
      if (value === "f") { setInput("/repo patch "); return; }
      if (value === "x") { setInput("/repo cleanup "); return; }
      if (value === "q") { setSelectedPane("home"); return; }
    }
    if (key.pageUp || (key.shift && key.upArrow)) {
      setScrollOffset((value) => expandedTurnId ? Math.max(0, value - 8) : Math.min(conversation.length, value + 3));
      return;
    }
    if (key.pageDown || (key.shift && key.downArrow)) {
      setScrollOffset((value) => expandedTurnId ? value + 8 : Math.max(0, value - 3));
      return;
    }
    if (key.upArrow && !key.shift) {
      const index = historyIndex ?? commandHistory.length;
      const next = Math.max(0, index - 1);
      const value = commandHistory[next];
      if (value !== undefined) {
        setHistoryIndex(next);
        setInput(value);
      }
      return;
    }
    if (key.downArrow && !key.shift) {
      if (historyIndex === undefined) return;
      const next = historyIndex + 1;
      if (next >= commandHistory.length) {
        setHistoryIndex(undefined);
        setInput("");
      } else {
        setHistoryIndex(next);
        setInput(commandHistory[next] ?? "");
      }
    }
  });

  async function runtimeAction(label: string, action: () => Promise<string>): Promise<void> {
    appendTurn(systemTurn(label, projectId, activeTask?.task_run_id, "command"));
    try {
      const output = await action();
      appendTurn(systemTurn(output.slice(0, 4000), projectId, activeTask?.task_run_id, "output", "Runtime action"));
      await status.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Runtime action failed.";
      appendTurn(errorTurn(message, projectId, activeTask?.task_run_id));
    }
  }

  async function dispatch(event: UserFrameEvent | TuiUserFrameEvent, inputText?: string): Promise<void> {
    appendTurn(userTurn(inputText ?? eventText(event), projectId, activeTask?.task_run_id));
    appendTurn(pendingTurn(event, projectId, activeTask?.task_run_id));
    try {
      const result = await submitEvent(event);
      const submittedProjectId = result.status === "submitted" ? result.project_id : undefined;
      const submittedTaskId = result.status === "submitted" ? result.task_run_id : undefined;
      appendTurn(resultTurn(result.message, "output" in result ? result.output : undefined, result.status, submittedProjectId ?? projectId, submittedTaskId ?? activeTask?.task_run_id, resultTitle(event, result.status)));
      if (submittedProjectId) setProjectId(submittedProjectId);
      const snapshot = runSnapshotFromOutput("output" in result ? result.output : undefined);
      if (snapshot) {
        setRunSnapshot(snapshot);
        setActiveObject(snapshot.active_node_id ? { type: "node", id: snapshot.active_node_id } : undefined);
        setSelectedPane("run");
      }
      const library = planLibraryFromOutput("output" in result ? result.output : undefined);
      if (library) {
        setPlanLibrary(library);
        setSelectedPane("plan_library");
      }
      setPendingFlow(undefined);
      await status.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "User frame event failed.";
      appendTurn(errorTurn(message, projectId, activeTask?.task_run_id, errorTitle(event)));
    }
  }

  async function onSubmit(value: string): Promise<void> {
    const trimmed = value.trim();
    if (trimmed) {
      setCommandHistory((items) => items[items.length - 1] === trimmed ? items : [...items, trimmed].slice(-80));
      setHistoryIndex(undefined);
    }
    if (trimmed.startsWith("/copy")) {
      setInput("");
      appendTurn(copyTurn(currentViewText(model), projectId, activeTask?.task_run_id));
      setSelectedPane("chat");
      return;
    }
    if (trimmed === "/expand" || trimmed.startsWith("/expand ")) {
      setInput("");
      const turn = turnToExpand(conversation, scrollOffset);
      if (!turn) {
        appendTurn(errorTurn("No transcript card is available to expand.", projectId, activeTask?.task_run_id, "Expand"));
        return;
      }
      setExpandedTurnId(turn.turn_id);
      setScrollOffset(0);
      setSelectedPane("chat");
      return;
    }
    if (trimmed === "/collapse" || trimmed === "/close") {
      setInput("");
      setExpandedTurnId(undefined);
      setScrollOffset(0);
      setSelectedPane("chat");
      return;
    }
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
    if (parsed.kind === "command" && parsed.pane) {
      if (!parsed.event || parsed.pane === "chat") setSelectedPane(parsed.pane);
      if (!parsed.event) {
        appendTurn(userTurn(trimmed, projectId, activeTask?.task_run_id));
        appendTurn(systemTurn(viewJournalText(parsed.pane, model), projectId, activeTask?.task_run_id, "output", viewTitle(parsed.pane)));
      }
    }
    if (parsed.kind === "command" && parsed.attachProjectId) {
      setProjectId(parsed.attachProjectId);
      appendTurn(systemTurn(`Attached to ${parsed.attachProjectId}.`, parsed.attachProjectId, undefined, "output", "Attach"));
      return;
    }
    if (parsed.kind === "command" && parsed.error) {
      appendTurn(errorTurn(parsed.error, projectId, activeTask?.task_run_id, "Command error"));
      return;
    }
    if (parsed.kind === "suggestion") {
      setPendingFlow(parsed.flow);
      setSelectedPane("home");
      appendTurn(userTurn(value, projectId, activeTask?.task_run_id));
      appendTurn(systemTurn(suggestionText(parsed.flow), projectId, activeTask?.task_run_id, "suggestion", parsed.flow.title));
      return;
    }
    if (parsed.kind === "suggestions") {
      const [first] = parsed.flows;
      setPendingFlow(first);
      setSelectedPane("home");
      appendTurn(userTurn(value, projectId, activeTask?.task_run_id));
      appendTurn(systemTurn(`${parsed.message}\n${parsed.flows.map((flow) => `- ${flow.command}`).join("\n")}`, projectId, activeTask?.task_run_id, "suggestion", "Suggested flows"));
      return;
    }
    if (parsed.event) await dispatch(parsed.event, trimmed || undefined);
  }

  function handleInputChange(value: string): void {
    setHistoryIndex(undefined);
    setInput(value);
  }

  function appendTurn(turn: ConversationTurn): void {
    setConversation((turns) => [...turns, turn]);
    setScrollOffset(0);
    setExpandedTurnId(undefined);
  }

  function toggleExpandedTurn(): void {
    if (expandedTurnId) {
      setExpandedTurnId(undefined);
      setScrollOffset(0);
      setSelectedPane("chat");
      return;
    }
    const turn = turnToExpand(conversation, scrollOffset);
    if (!turn) return;
    setExpandedTurnId(turn.turn_id);
    setScrollOffset(0);
    setSelectedPane("chat");
  }

  return <Layout model={model} input={input} setInput={handleInputChange} onSubmit={(value) => void onSubmit(value)} />;
}

function userTurn(text: string, project_id?: string, task_id?: string): ConversationTurn {
  return { turn_id: turnId("user"), role: "user", kind: text.trim().startsWith("/") ? "command" : "message", text, created_at: new Date().toISOString(), ...(project_id ? { project_id } : {}), ...(task_id ? { task_id } : {}) };
}

function systemTurn(text: string, project_id?: string, task_id?: string, kind: ConversationTurn["kind"] = "message", title?: string): ConversationTurn {
  return { turn_id: turnId("system"), role: "system", kind, ...(title ? { title } : {}), status: kind === "output" ? "completed" : "info", text, created_at: new Date().toISOString(), ...(project_id ? { project_id } : {}), ...(task_id ? { task_id } : {}) };
}

function resultTurn(message: string, output: unknown, status: string, project_id?: string, task_id?: string, title?: string): ConversationTurn {
  const text = output === undefined ? message : `${message}\n\n${JSON.stringify(output, null, 2)}`;
  return { turn_id: turnId("output"), role: "system", kind: "output", status: status === "failed" ? "failed" : "completed", title: title ?? status, text, created_at: new Date().toISOString(), ...(project_id ? { project_id } : {}), ...(task_id ? { task_id } : {}) };
}

function pendingTurn(event: UserFrameEvent | TuiUserFrameEvent, project_id?: string, task_id?: string): ConversationTurn {
  return {
    turn_id: turnId("pending"),
    role: "system",
    kind: "output",
    status: "pending",
    title: pendingTitle(event),
    text: pendingText(event),
    created_at: new Date().toISOString(),
    ...(project_id ? { project_id } : {}),
    ...(task_id ? { task_id } : {}),
  };
}

function errorTurn(text: string, project_id?: string, task_id?: string, title = "Action failed"): ConversationTurn {
  return { turn_id: turnId("error"), role: "system", kind: "error", status: "failed", title, text, created_at: new Date().toISOString(), ...(project_id ? { project_id } : {}), ...(task_id ? { task_id } : {}) };
}

function copyTurn(text: string, project_id?: string, task_id?: string): ConversationTurn {
  return { turn_id: turnId("copy"), role: "system", kind: "copy", status: "info", title: "Current view text", text, created_at: new Date().toISOString(), ...(project_id ? { project_id } : {}), ...(task_id ? { task_id } : {}) };
}

function viewTitle(pane: PaneId): string {
  if (pane === "demo") return "Sample Planfiles";
  if (pane === "capabilities") return "Providers";
  if (pane === "pack_builder") return "Packs";
  if (pane === "plan_library") return "Plan Library";
  if (pane === "artifact_json") return "Artifacts";
  if (pane === "doctor") return "Doctor";
  if (pane === "help") return "Help";
  return "View";
}

function viewJournalText(pane: PaneId, model: ReturnType<typeof buildViewModel>): string {
  if (pane === "help") return "Opened Help. Use slash commands for precise flows, or type natural language and confirm the suggested flow.";
  if (pane === "demo") return "Opened Sample Planfiles. Use /demo run repo-json-output for a dry-run preview, or /demo run repo-json-output --live for isolated local worktree execution.";
  if (pane === "capabilities") return `Opened Providers. Runtime reports ${model.health.packs} registered pack(s). Use /providers for profile provider configuration or /packs for capability packs.`;
  if (pane === "pack_builder") return "Opened Packs. Use /pack build <skills.md> for generated pack previews or /pack inspect <pack_id> for installed pack details.";
  if (pane === "artifact_json") return "Opened Artifacts. Use /run outputs latest for the latest primary outputs, /artifact recent for high-signal artifacts, or /artifact show <artifact_id> for a specific item.";
  if (pane === "doctor") return "Opened Doctor. Use /doctor to run checks and journal the result.";
  if (pane === "timeline") return `Opened Timeline. ${model.timeline.length} timeline event(s) are currently visible in the selected project.`;
  if (pane === "tasks") return `Opened Tasks. ${model.project?.task_statuses.length ?? 0} task(s) are currently attached.`;
  if (pane === "approvals") return `Opened Approvals. ${model.approvals.length} approval request(s) are currently pending.`;
  if (pane === "plan") return `Opened Plans. ${model.plan ? `Plan ${model.plan.plan_id} is loaded.` : "Use /compose <goal>, /library, or /check <planfile>."}`;
  if (pane === "plan_library") return `Opened Plan Library. ${model.planLibrary?.plans.length ?? 0} saved Planfile(s) are visible.`;
  if (pane === "run") return "Opened Runs. Inspect run outputs with /run list or /run outputs latest.";
  if (pane === "diff") return "Opened Diff. Attach a project or use a repository workflow to load diff output.";
  if (pane === "verification") return `Opened Verification. ${model.verificationResults.length} verification result(s) are currently attached.`;
  if (pane === "review") return "Opened Review. Attach a project or run a workflow to load review output.";
  return `Opened ${pane}.`;
}

function welcomeTurn(): ConversationTurn {
  return {
    turn_id: "turn-welcome",
    role: "system",
    kind: "message",
    status: "info",
    title: "Welcome",
    text: "Ask what Open Lagrange can do, type a goal, or use /help. Work starts only after a typed flow or confirmation.",
    created_at: new Date().toISOString(),
  };
}

function turnId(prefix: string): string {
  return `turn-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function currentViewText(model: ReturnType<typeof buildViewModel>): string {
  const lines = [
    `View: ${model.selectedPane}`,
    `Profile: ${model.health.profile}`,
    `API: ${model.health.api}`,
    `Worker: ${model.health.worker}`,
    `Model: ${model.health.model}`,
    "",
    "Transcript:",
    ...model.conversation.map((turn) => `[${turn.kind ?? turn.role}] ${turn.title ? `${turn.title}: ` : ""}${turn.text}`),
  ];
  return lines.join("\n");
}

function turnToExpand(turns: readonly ConversationTurn[], scrollOffset: number): ConversationTurn | undefined {
  const end = Math.max(0, turns.length - Math.max(0, scrollOffset));
  return turns[end - 1] ?? turns.at(-1);
}

function runSnapshotFromOutput(output: unknown): RunSnapshot | undefined {
  if (!output || typeof output !== "object") return undefined;
  const record = output as Record<string, unknown>;
  const snapshot = record.snapshot;
  if (snapshot && typeof snapshot === "object" && typeof (snapshot as Record<string, unknown>).run_id === "string") return snapshot as RunSnapshot;
  if (typeof record.run_id === "string" && Array.isArray(record.nodes) && Array.isArray(record.timeline)) return record as unknown as RunSnapshot;
  return undefined;
}

function planLibraryFromOutput(output: unknown): PlanLibraryViewSummary | undefined {
  if (!output || typeof output !== "object") return undefined;
  const record = output as Record<string, unknown>;
  if (Array.isArray(record.libraries) && Array.isArray(record.plans)) return record as unknown as PlanLibraryViewSummary;
  if (record.plan_check_report) return { libraries: [], plans: [], plan_check_report: record.plan_check_report };
  return undefined;
}

function eventText(event: UserFrameEvent | TuiUserFrameEvent): string {
  if (event.type === "chat.help") return "/help";
  if (event.type === "pack.list") return "/packs";
  if (event.type === "demo.list") return "/demos";
  if (event.type === "capability.list") return "/capabilities";
  if (event.type === "chat.message" || event.type === "intent.classify") return event.text;
  if (event.type === "plan.compose") return event.prompt;
  if (event.type === "plan.create") return event.goal;
  if (event.type === "repo.run") return event.goal;
  if (event.type === "skill.frame" || event.type === "skill.plan" || event.type === "pack.build") return `${event.type} ${event.file}`;
  if (event.type === "pack.inspect") return `inspect ${event.pack_id}`;
  if (event.type === "demo.run") return `run demo ${event.demo_id}`;
  if (event.type === "research.search") return `research search ${event.query}`;
  if (event.type === "research.fetch") return `research fetch ${event.url}`;
  if (event.type === "research.brief") return `research brief ${event.topic}`;
  if (event.type === "research.export") return `research export ${event.brief_id}`;
  if (event.type === "run.show") return event.outputs_only ? `show run outputs ${event.run_id}` : `show run ${event.run_id}`;
  if (event.type === "run.resume") return `resume run ${event.run_id}`;
  if (event.type === "run.retry") return `retry run ${event.run_id} ${event.node_id} ${event.replay_mode}`;
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

function pendingTitle(event: UserFrameEvent | TuiUserFrameEvent): string {
  if (event.type === "chat.help") return "Loading help";
  if (event.type === "pack.list") return "Loading packs";
  if (event.type === "demo.list") return "Loading demos";
  if (event.type === "capability.list") return "Loading capabilities";
  if (event.type === "demo.run") return event.dry_run ? "Running dry-run demo" : "Running live demo";
  if (event.type === "research.search") return "Searching sources";
  if (event.type === "research.fetch") return "Fetching source";
  if (event.type === "research.brief") return "Creating research brief";
  if (event.type === "research.export") return "Exporting research markdown";
  if (event.type === "run.show") return event.outputs_only ? "Loading run outputs" : "Loading run";
  if (event.type === "run.resume") return "Resuming run";
  if (event.type === "run.retry") return "Retrying run node";
  if (event.type === "artifact.show") return event.artifact_id === "list" ? "Loading artifact index" : "Loading artifact";
  if (event.type === "pack.build") return "Building pack preview";
  if (event.type === "skill.plan" || event.type === "skill.frame") return "Processing skill";
  if (event.type === "plan.compose") return "Composing Planfile";
  if (event.type === "plan.create") return "Creating Planfile";
  if (event.type === "repo.run") return "Starting repository workflow";
  if (event.type === "status.show") return "Loading status";
  if (event.type === "doctor.run") return "Running doctor";
  return "Running command";
}

function pendingText(event: UserFrameEvent | TuiUserFrameEvent): string {
  if (event.type === "chat.help") return "Rendering TUI commands and navigation in the journal.";
  if (event.type === "pack.list") return "Reading installed pack and capability summaries.";
  if (event.type === "demo.list") return "Reading available golden path demos.";
  if (event.type === "capability.list") return "Reading the live capability summary.";
  if (event.type === "demo.run") {
    return [
      `Demo: ${event.demo_id}`,
      `Mode: ${event.dry_run ? "dry-run preview" : "live local execution"}`,
      event.dry_run
        ? "Creating preview artifacts: Planfile, PatchPlan, PatchArtifact, verification, review, and timeline."
        : "Creating fixture copy, isolated git worktree, PlanRunner execution, verification, review, and final patch artifact.",
    ].join("\n");
  }
  if (event.type === "artifact.show") {
    return event.artifact_id === "list"
      ? "Reading recent runs and high-signal artifacts. Primary outputs are shown before supporting details."
      : `Reading artifact ${event.artifact_id} from the local artifact index.`;
  }
  if (event.type === "run.show") {
    if (event.run_id === "list") return "Reading recent runs from the local run index.";
    return event.outputs_only
      ? `Reading primary and supporting outputs for run ${event.run_id}.`
      : `Reading run ${event.run_id}.`;
  }
  if (event.type === "run.resume") return `Requesting resume for run ${event.run_id}.`;
  if (event.type === "run.retry") return `Requesting retry for run ${event.run_id}, node ${event.node_id}, mode ${event.replay_mode}.`;
  if (event.type === "research.search") return `Searching for source candidates: ${event.query}`;
  if (event.type === "research.fetch") return `Fetching ${event.url} in ${event.mode} mode.`;
  if (event.type === "research.brief") return `Creating a cited brief for ${event.topic} in ${event.mode} mode.`;
  if (event.type === "research.export") return `Exporting research brief artifact ${event.brief_id}.`;
  if (event.type === "plan.compose") return `Composing a reviewable Planfile for: ${event.prompt}`;
  return eventText(event);
}

function resultTitle(event: UserFrameEvent | TuiUserFrameEvent, status: string): string {
  if (event.type === "chat.help") return status === "failed" ? "Help error" : "Help";
  if (event.type === "pack.list") return status === "failed" ? "Packs error" : "Packs";
  if (event.type === "demo.list") return status === "failed" ? "Demos error" : "Demos";
  if (event.type === "capability.list") return status === "failed" ? "Capabilities error" : "Capabilities";
  if (event.type === "artifact.show") return status === "failed" ? "Artifact error" : "Artifact result";
  if (event.type === "run.show") return status === "failed" ? "Run error" : "Run result";
  if (event.type === "run.resume" || event.type === "run.retry") return status === "failed" ? "Run action error" : "Run action";
  if (event.type === "demo.run") return status === "failed" ? "Demo failed" : "Demo completed";
  if (event.type.startsWith("research.")) return status === "failed" ? "Research error" : "Research result";
  return status;
}

function errorTitle(event: UserFrameEvent | TuiUserFrameEvent): string {
  if (event.type === "chat.help") return "Help error";
  if (event.type === "pack.list") return "Packs error";
  if (event.type === "demo.list") return "Demos error";
  if (event.type === "capability.list") return "Capabilities error";
  if (event.type === "artifact.show") return "Artifact error";
  if (event.type === "run.show") return "Run error";
  if (event.type === "run.resume" || event.type === "run.retry") return "Run action error";
  if (event.type === "demo.run") return "Demo error";
  if (event.type.startsWith("research.")) return "Research error";
  return "Action failed";
}
