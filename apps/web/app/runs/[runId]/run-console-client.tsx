"use client";

import { useEffect, useMemo, useState } from "react";

type TabId = "overview" | "timeline" | "artifacts" | "approvals" | "model_calls" | "output" | "logs" | "plan";
type LiveState = "connected" | "reconnecting" | "polling fallback" | "disconnected";

interface RunSnapshot {
  readonly run_id: string;
  readonly plan_id: string;
  readonly builder_session_id?: string;
  readonly plan_title: string;
  readonly status: string;
  readonly runtime: "hatchet" | "local_dev";
  readonly active_node_id?: string;
  readonly nodes: readonly RunNode[];
  readonly timeline: readonly TimelineItem[];
  readonly artifacts: readonly ArtifactItem[];
  readonly approvals: readonly ApprovalItem[];
  readonly model_calls: readonly ModelCallItem[];
  readonly policy_reports: readonly PolicyReportItem[];
  readonly errors: readonly ErrorItem[];
  readonly next_actions: readonly NextAction[];
  readonly started_at: string;
  readonly completed_at?: string;
  readonly plan_markdown?: string;
}

interface RunNode {
  readonly node_id: string;
  readonly title: string;
  readonly kind: string;
  readonly status: string;
  readonly capability_refs: readonly string[];
  readonly artifact_refs: readonly string[];
  readonly error_refs: readonly string[];
  readonly approval_refs: readonly string[];
}

interface TimelineItem {
  readonly event_id: string;
  readonly timestamp: string;
  readonly type: string;
  readonly node_id?: string;
  readonly artifact_id?: string;
  readonly approval_id?: string;
  readonly capability_ref?: string;
  readonly command_id?: string;
  readonly reason?: string;
  readonly decision?: string;
  readonly status?: string;
  readonly passed?: boolean;
  readonly errors?: readonly ErrorItem[];
  readonly next_actions?: readonly NextAction[];
  readonly sequence?: number;
}

interface RunEventEnvelope {
  readonly event_id: string;
  readonly run_id: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly runtime: "hatchet" | "local_dev";
  readonly event: TimelineItem;
}

interface ArtifactItem {
  readonly artifact_id: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly path_or_uri: string;
  readonly node_id?: string;
  readonly exportable: boolean;
}

interface ApprovalItem {
  readonly approval_id: string;
  readonly status: string;
  readonly title: string;
  readonly summary: string;
  readonly node_id?: string;
}

interface ModelCallItem {
  readonly artifact_id: string;
  readonly title: string;
  readonly summary: string;
  readonly role: string;
  readonly model: string;
  readonly node_id?: string;
}

interface PolicyReportItem {
  readonly node_id?: string;
  readonly capability_ref?: string;
  readonly decision: string;
  readonly reason: string;
  readonly created_at: string;
}

interface ErrorItem {
  readonly code: string;
  readonly task_id?: string;
  readonly message: string;
  readonly observed_at?: string;
}

interface NextAction {
  readonly action_id: string;
  readonly label: string;
  readonly command?: string;
  readonly action_type: string;
  readonly required: boolean;
  readonly target_ref?: string;
  readonly description?: string;
}

interface OutputSelection {
  readonly selection_id?: string;
  readonly selected_artifacts?: readonly ArtifactItem[];
  readonly excluded_artifacts?: readonly { readonly artifact_id: string; readonly reason: string }[];
  readonly warnings?: readonly string[];
}

interface OutputView {
  readonly recommended_preset?: string;
  readonly selection?: OutputSelection;
  readonly last_result?: unknown;
}

const tabs: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "artifacts", label: "Artifacts" },
  { id: "approvals", label: "Approvals" },
  { id: "model_calls", label: "Model Calls" },
  { id: "output", label: "Output" },
  { id: "logs", label: "Logs" },
  { id: "plan", label: "Plan" },
];

export default function RunConsoleClient({ runId }: { readonly runId: string }): React.ReactNode {
  const [snapshot, setSnapshot] = useState<RunSnapshot | undefined>();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedId, setSelectedId] = useState<string>("");
  const [token, setToken] = useState("");
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryNodeId, setRetryNodeId] = useState<string>("");
  const [lastEventId, setLastEventId] = useState<string>("");
  const [liveState, setLiveState] = useState<LiveState>("disconnected");
  const [outputView, setOutputView] = useState<OutputView | undefined>();

  const selectedNode = useMemo(() => snapshot?.nodes.find((node) => node.node_id === (selectedId || snapshot.active_node_id)), [selectedId, snapshot]);
  const selectedArtifact = useMemo(() => snapshot?.artifacts.find((artifact) => artifact.artifact_id === selectedId), [selectedId, snapshot]);
  const activeNode = snapshot?.nodes.find((node) => node.node_id === snapshot.active_node_id);

  useEffect(() => {
    const storedToken = window.sessionStorage.getItem("open-lagrange-api-token") ?? "";
    setToken(storedToken);
    setTokenLoaded(true);
    const saved = readLocalUiState(runId);
    if (saved.activeTab) setActiveTab(saved.activeTab);
    if (saved.selectedId) setSelectedId(saved.selectedId);
    void refresh(false, storedToken);
  }, [runId]);

  useEffect(() => {
    if (!tokenLoaded) return;
    const controller = new AbortController();
    void streamRun(controller.signal, token);
    return () => {
      controller.abort();
      setLiveState("disconnected");
    };
  }, [runId, token, tokenLoaded]);

  useEffect(() => {
    writeLocalUiState(runId, { activeTab, selectedId });
    const timeout = window.setTimeout(() => {
      void mutateUiState({
        active_tab: activeTab,
        selected_node_id: snapshot?.nodes.some((node) => node.node_id === selectedId) ? selectedId : undefined,
        selected_artifact_id: snapshot?.artifacts.some((artifact) => artifact.artifact_id === selectedId) ? selectedId : undefined,
        selected_approval_id: snapshot?.approvals.some((approval) => approval.approval_id === selectedId) ? selectedId : undefined,
        selected_model_call_id: snapshot?.model_calls.some((call) => call.artifact_id === selectedId) ? selectedId : undefined,
        last_viewed_event_id: lastEventId || undefined,
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [activeTab, selectedId, lastEventId, runId]);

  async function streamRun(signal: AbortSignal, streamToken: string): Promise<void> {
    let cursor = lastEventId || undefined;
    let failures = 0;
    while (!signal.aborted) {
      try {
        const suffix = cursor ? `?after=${encodeURIComponent(cursor)}` : "";
        const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/events/stream${suffix}`, { headers: headers(streamToken), signal });
        if (!response.ok || !response.body) {
          const data = await readBody(response);
          throw new Error(requestFailureMessage(response.status, data, `/api/runs/${runId}/events/stream`, "Run Console event stream"));
        }
        failures = 0;
        setLiveState("connected");
        for await (const frame of readSseFrames(response.body, signal)) {
          const nextCursor = handleSseFrame(frame);
          if (nextCursor) cursor = nextCursor;
        }
      } catch (error) {
        if (signal.aborted) return;
        failures += 1;
        setLiveState(failures >= 3 ? "polling fallback" : "reconnecting");
        setMessage(error instanceof Error ? error.message : String(error));
        await refresh(true, streamToken);
        await sleep(Math.min(10_000, 500 * (2 ** Math.min(5, failures))), signal);
      }
    }
  }

  function handleSseFrame(frame: SseFrame): string | undefined {
    if (frame.event === "run.error") {
      setLiveState("polling fallback");
      setMessage(frame.data ?? "Run event stream reported an error.");
      void refresh(true);
      return undefined;
    }
    if (frame.event !== "run.event" || !frame.data) return undefined;
    const envelope = JSON.parse(frame.data) as RunEventEnvelope;
    const event = { ...envelope.event, sequence: envelope.sequence };
    setLastEventId(envelope.event_id);
    setSnapshot((current) => current ? applyRunEventToSnapshot(current, event) : current);
    void refresh(true);
    return envelope.event_id;
  }

  async function refresh(quiet = false, tokenOverride?: string): Promise<void> {
    setBusy(true);
    if (!quiet) setMessage("");
    try {
      const requestToken = tokenOverride ?? token;
      const route = `/api/runs/${encodeURIComponent(runId)}`;
      const response = await fetch(route, { headers: headers(requestToken) });
      const data = await readBody(response);
      if (!response.ok || isMissingRun(data)) {
        if (!quiet) setMessage(requestFailureMessage(response.status, data, route, "Run Console snapshot request"));
        return;
      }
      setSnapshot(data as RunSnapshot);
      if (!selectedId && (data as RunSnapshot).active_node_id) setSelectedId(String((data as RunSnapshot).active_node_id));
      if (!quiet) setMessage(snapshotRefreshMessage(data as RunSnapshot));
      if (!quiet && activeTab === "output") void refreshOutput(true);
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: NextAction): Promise<void> {
    if (!snapshot) return;
    if (action.action_type === "inspect_artifact") {
      setActiveTab("artifacts");
      const artifact = snapshot.artifacts[0];
      if (artifact) setSelectedId(artifact.artifact_id);
      return;
    }
    if (action.action_type === "edit_plan") {
      const sessionQuery = snapshot.builder_session_id ? `plan_builder_session=${encodeURIComponent(snapshot.builder_session_id)}` : `plan_id=${encodeURIComponent(snapshot.plan_id)}`;
      window.location.assign(`/?${sessionQuery}`);
      return;
    }
    const nodeId = snapshot.active_node_id ?? snapshot.nodes.find((node) => node.status === "failed" || node.status === "yielded")?.node_id;
    const url = action.action_type === "retry" && nodeId
      ? ""
      : action.action_type === "resume"
        ? `/api/runs/${encodeURIComponent(runId)}/resume`
        : "";
    if (action.action_type === "retry" && nodeId) {
      setRetryNodeId(nodeId);
      return;
    }
    if (!url) {
      setMessage(action.command ?? action.description ?? action.label);
      return;
    }
    await mutate(url, {});
  }

  async function retryWithMode(mode: "reuse-artifacts" | "refresh-artifacts" | "force-new-idempotency-key"): Promise<void> {
    if (!retryNodeId) return;
    const nodeId = retryNodeId;
    setRetryNodeId("");
    await mutate(`/api/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(nodeId)}/retry`, { replay_mode: mode });
  }

  async function cancel(): Promise<void> {
    await mutate(`/api/runs/${encodeURIComponent(runId)}/cancel`, {});
  }

  async function resolveApproval(approval: ApprovalItem, decision: "approve" | "reject"): Promise<void> {
    await mutate(`/api/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approval.approval_id)}/${decision}`, { reason: "Handled from Run Console.", decided_by: "web" });
  }

  async function mutate(url: string, body: unknown): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: headers(token), body: JSON.stringify(body) });
      const data = await readBody(response);
      if (!response.ok) {
        setMessage(requestFailureMessage(response.status, data, url, "Run Console control request"));
        return;
      }
      setMessage("Request accepted.");
      await refresh(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function mutateUiState(body: unknown): Promise<void> {
    try {
      await fetch(`/api/runs/${encodeURIComponent(runId)}/ui-state`, { method: "PUT", headers: headers(token), body: JSON.stringify(removeUndefined(body)) });
    } catch {
      // Browser storage remains the immediate fallback.
    }
  }

  async function refreshOutput(quiet = false): Promise<void> {
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/output`, { headers: headers(token) });
      const data = await readBody(response);
      if (!response.ok) {
        if (!quiet) setMessage(requestFailureMessage(response.status, data, `/api/runs/${runId}/output`, "Run Console output request"));
        return;
      }
      setOutputView(data as OutputView);
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function runOutput(action: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/output`, { method: "POST", headers: headers(token), body: JSON.stringify(action) });
      const data = await readBody(response);
      if (!response.ok) {
        setMessage(requestFailureMessage(response.status, data, `/api/runs/${runId}/output`, "Run Console output request"));
        return;
      }
      setOutputView((current) => ({
        recommended_preset: current?.recommended_preset ?? "final_outputs",
        ...(current?.selection ? { selection: current.selection } : {}),
        last_result: data,
      }));
      setMessage("Output request accepted.");
      await refresh(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="runConsole">
      <nav className="runTopNav" aria-label="Run Console navigation">
        <a href="/">Workbench</a>
        <a href="/?view=planner">Planner</a>
        <a href="/?view=workflows">Runs</a>
        <a href="/?view=providers">Providers</a>
      </nav>
      <RunHeader snapshot={snapshot} runId={runId} token={token} setToken={setToken} refresh={() => refresh()} cancel={cancel} busy={busy} liveState={liveState} />
      {message ? <pre className="messageBox">{message}</pre> : null}
      {retryNodeId ? <RetryModeDialog nodeId={retryNodeId} onCancel={() => setRetryNodeId("")} onSelect={retryWithMode} /> : null}
      <nav className="tabBar">
        {tabs.map((tab) => <button key={tab.id} type="button" className={tab.id === activeTab ? "active" : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </nav>
      <section className="runGrid">
        <RunStepList nodes={snapshot?.nodes ?? []} activeNodeId={snapshot?.active_node_id} selectedId={selectedId} setSelectedId={setSelectedId} />
        <div className="runMainPane">
          {activeTab === "overview" ? (
            <>
              <RunNextActions actions={snapshot?.next_actions ?? []} runAction={runAction} />
              <RunTimeline items={(snapshot?.timeline ?? []).slice(-8)} />
            </>
          ) : null}
          {activeTab === "timeline" ? <RunTimeline items={snapshot?.timeline ?? []} /> : null}
          {activeTab === "artifacts" ? <RunArtifactList artifacts={snapshot?.artifacts ?? []} selectedId={selectedId} setSelectedId={setSelectedId} /> : null}
          {activeTab === "approvals" ? <RunApprovalPanel approvals={snapshot?.approvals ?? []} resolveApproval={resolveApproval} /> : null}
          {activeTab === "model_calls" ? <RunModelCallsPanel calls={snapshot?.model_calls ?? []} /> : null}
          {activeTab === "output" ? <RunOutputPanel snapshot={snapshot} outputView={outputView} refreshOutput={refreshOutput} runOutput={runOutput} busy={busy} /> : null}
          {activeTab === "logs" ? <RunLogsPanel errors={snapshot?.errors ?? []} policies={snapshot?.policy_reports ?? []} /> : null}
          {activeTab === "plan" ? <RunPlanPane markdown={snapshot?.plan_markdown} /> : null}
        </div>
        <RunDetailPane node={selectedNode ?? activeNode} artifact={selectedArtifact} snapshot={snapshot} />
      </section>
    </main>
  );
}

function RunHeader(input: { readonly snapshot: RunSnapshot | undefined; readonly runId: string; readonly token: string; readonly setToken: (value: string) => void; readonly refresh: () => void; readonly cancel: () => void; readonly busy: boolean; readonly liveState: LiveState }): React.ReactNode {
  return (
    <header className="runHeader">
      <div>
        <p className="eyebrow">Run Console</p>
        <h1>{input.snapshot?.plan_title ?? input.runId}</h1>
        <div className="statusStrip">
          <span className={`statusPill ${statusTone(input.snapshot?.status ?? "pending")}`}>{input.snapshot?.status ?? "loading"}</span>
          <span>Runtime: {input.snapshot?.runtime ?? "unknown"}</span>
          <span>Live: {input.liveState}</span>
          <span>{input.snapshot?.active_node_id ? `Active node: ${input.snapshot.active_node_id}` : "No active node"}</span>
          <span>{input.snapshot?.started_at ?? ""}</span>
        </div>
      </div>
      <div className="tokenTools">
        <input value={input.token} onChange={(event) => updateToken(event.target.value, input.setToken)} placeholder="API bearer token" />
        <button type="button" onClick={input.refresh} disabled={input.busy}>Refresh</button>
        <button type="button" onClick={input.cancel} disabled={input.busy || !input.snapshot || terminalStatus(input.snapshot.status)}>Cancel</button>
      </div>
    </header>
  );
}

function RetryModeDialog(input: { readonly nodeId: string; readonly onCancel: () => void; readonly onSelect: (mode: "reuse-artifacts" | "refresh-artifacts" | "force-new-idempotency-key") => void }): React.ReactNode {
  return (
    <section className="runModal">
      <div className="runModalPanel">
        <h2>Retry {input.nodeId}</h2>
        <p>Choose replay mode explicitly.</p>
        <button type="button" onClick={() => input.onSelect("reuse-artifacts")}>Reuse Artifacts</button>
        <button type="button" onClick={() => input.onSelect("refresh-artifacts")}>Refresh Artifacts</button>
        <button type="button" onClick={() => input.onSelect("force-new-idempotency-key")}>Force New Execution</button>
        <button type="button" className="secondaryButton" onClick={input.onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function RunStepList(input: { readonly nodes: readonly RunNode[]; readonly activeNodeId: string | undefined; readonly selectedId: string; readonly setSelectedId: (value: string) => void }): React.ReactNode {
  return (
    <aside className="runSidePane">
      <h2>Steps</h2>
      {input.nodes.length ? input.nodes.map((node) => (
        <button key={node.node_id} type="button" className={`stepButton ${node.node_id === input.activeNodeId ? "active" : ""} ${node.node_id === input.selectedId ? "selected" : ""}`} onClick={() => input.setSelectedId(node.node_id)}>
          <span>{node.title}</span>
          <small>{node.kind} · {node.status}</small>
        </button>
      )) : <p className="emptyState">No steps recorded.</p>}
    </aside>
  );
}

function RunTimeline({ items }: { readonly items: readonly TimelineItem[] }): React.ReactNode {
  const ordered = [...items].sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER) || left.timestamp.localeCompare(right.timestamp) || left.event_id.localeCompare(right.event_id));
  return <section className="runPanel"><h2>Timeline</h2>{ordered.length ? ordered.map((item) => <article key={item.event_id} className={`timelineItem ${eventTone(item)}`}><span>{item.timestamp}</span><strong>{eventTitle(item)}</strong><p>{eventSummary(item)}</p></article>) : <p className="emptyState">No events recorded.</p>}</section>;
}

function RunNextActions({ actions, runAction }: { readonly actions: readonly NextAction[]; readonly runAction: (action: NextAction) => void }): React.ReactNode {
  return <section className="runPanel"><h2>Next Actions</h2><div className="actionGrid">{actions.length ? actions.map((action) => <button key={`${action.action_type}-${action.label}`} type="button" onClick={() => runAction(action)}>{action.label}</button>) : <p className="emptyState">No action required.</p>}</div></section>;
}

function RunArtifactList(input: { readonly artifacts: readonly ArtifactItem[]; readonly selectedId: string; readonly setSelectedId: (value: string) => void }): React.ReactNode {
  return <section className="runPanel"><h2>Artifacts</h2>{input.artifacts.length ? input.artifacts.map((artifact) => <button key={artifact.artifact_id} type="button" className={`artifactButton ${artifact.artifact_id === input.selectedId ? "selected" : ""}`} onClick={() => input.setSelectedId(artifact.artifact_id)}><strong>{artifact.title}</strong><span>{artifact.kind}</span><p>{artifact.summary}</p></button>) : <p className="emptyState">No artifacts recorded.</p>}</section>;
}

function RunDetailPane(input: { readonly node: RunNode | undefined; readonly artifact: ArtifactItem | undefined; readonly snapshot: RunSnapshot | undefined }): React.ReactNode {
  return (
    <aside className="runDetailPane">
      <h2>Details</h2>
      {input.artifact ? <RunArtifactViewer artifact={input.artifact} /> : input.node ? (
        <>
          <h3>{input.node.title}</h3>
          <p>{input.node.kind} · {input.node.status}</p>
          <KeyValue label="Capabilities" value={input.node.capability_refs.join(", ") || "none"} />
          <KeyValue label="Artifacts" value={String(input.node.artifact_refs.length)} />
          <KeyValue label="Approvals" value={String(input.node.approval_refs.length)} />
        </>
      ) : <p className="emptyState">Select a step or artifact.</p>}
      {input.snapshot?.errors.length ? <RunLogsPanel errors={input.snapshot.errors} policies={[]} /> : null}
    </aside>
  );
}

function RunArtifactViewer({ artifact }: { readonly artifact: ArtifactItem }): React.ReactNode {
  return <div><h3>{artifact.title}</h3><p>{artifact.summary}</p><KeyValue label="Kind" value={artifact.kind} /><KeyValue label="URI" value={artifact.path_or_uri} /><KeyValue label="Exportable" value={artifact.exportable ? "yes" : "no"} /></div>;
}

function RunApprovalPanel(input: { readonly approvals: readonly ApprovalItem[]; readonly resolveApproval: (approval: ApprovalItem, decision: "approve" | "reject") => void }): React.ReactNode {
  return <section className="runPanel"><h2>Approvals</h2>{input.approvals.length ? input.approvals.map((approval) => <article key={approval.approval_id} className="approvalRow"><div><strong>{approval.title}</strong><p>{approval.summary}</p><span>{approval.status}</span></div>{approval.status === "requested" ? <div className="buttonRow"><button type="button" onClick={() => input.resolveApproval(approval, "approve")}>Approve</button><button type="button" onClick={() => input.resolveApproval(approval, "reject")}>Reject</button></div> : null}</article>) : <p className="emptyState">No approvals recorded.</p>}</section>;
}

function RunModelCallsPanel({ calls }: { readonly calls: readonly ModelCallItem[] }): React.ReactNode {
  return <section className="runPanel"><h2>Model Calls</h2>{calls.length ? calls.map((call) => <article key={call.artifact_id} className="recordCard"><h3>{call.title}</h3><p>{call.summary}</p><span>{call.node_id ?? "run"} · {call.role} · {call.model}</span></article>) : <p className="emptyState">No model calls recorded.</p>}</section>;
}

function RunOutputPanel(input: {
  readonly snapshot: RunSnapshot | undefined;
  readonly outputView: OutputView | undefined;
  readonly refreshOutput: (quiet?: boolean) => void;
  readonly runOutput: (action: Record<string, unknown>) => void;
  readonly busy: boolean;
}): React.ReactNode {
  const preset = recommendedPreset(input.snapshot);
  const selected = input.outputView?.selection?.selected_artifacts ?? [];
  const excluded = input.outputView?.selection?.excluded_artifacts ?? [];
  const finalArtifact = selected.find((artifact) => artifact.kind === "research_brief" || artifact.kind === "final_patch_artifact" || artifact.kind === "run_packet" || artifact.kind === "markdown_export") ?? selected[0];
  return (
    <section className="runPanel">
      <h2>Output</h2>
      <div className="statusStrip">
        <span>Recommended: {preset}</span>
        <span>Selected: {selected.length}</span>
        <span>Excluded: {excluded.length}</span>
      </div>
      <div className="buttonRow">
        <button type="button" disabled={input.busy} onClick={() => input.refreshOutput(false)}>Select Outputs</button>
        <button type="button" disabled={input.busy} onClick={() => input.runOutput({ action: "packet", packet_type: packetType(input.snapshot), deterministic: true })}>Create Packet</button>
        <button type="button" disabled={input.busy} onClick={() => input.runOutput({ action: "digest", digest_style: digestStyle(input.snapshot), deterministic: true })}>Create Digest</button>
        <button type="button" disabled={input.busy || !finalArtifact} onClick={() => input.runOutput({ action: "render_html", artifact_id: finalArtifact?.artifact_id })}>Render HTML</button>
        <button type="button" disabled={input.busy || !finalArtifact} onClick={() => input.runOutput({ action: "render_pdf", artifact_id: finalArtifact?.artifact_id })}>Render PDF</button>
      </div>
      <h3>Recommended Final Outputs</h3>
      {selected.length ? selected.map((artifact) => <article key={artifact.artifact_id} className="recordCard"><strong>{artifact.title}</strong><p>{artifact.summary}</p><span>{artifact.kind} · {artifact.artifact_id}</span></article>) : <p className="emptyState">Select outputs to see recommended artifacts.</p>}
      {excluded.length ? <><h3>Excluded</h3>{excluded.slice(0, 8).map((item) => <pre key={`${item.artifact_id}-${item.reason}`} className="logLine">{item.artifact_id}: {item.reason}</pre>)}</> : null}
      {input.outputView?.last_result ? <><h3>Latest Output Result</h3><pre className="planMarkdown">{JSON.stringify(input.outputView.last_result, null, 2)}</pre></> : null}
    </section>
  );
}

function RunLogsPanel({ errors, policies }: { readonly errors: readonly ErrorItem[]; readonly policies: readonly PolicyReportItem[] }): React.ReactNode {
  return <section className="runPanel"><h2>Logs</h2>{errors.map((error, index) => <pre key={`${error.code}-${index}`} className="logLine">{error.task_id ? `${error.task_id}: ` : ""}{error.message}</pre>)}{policies.map((policy, index) => <pre key={`${policy.created_at}-${index}`} className="logLine">{policy.node_id ?? "run"} policy {policy.decision}: {policy.reason}</pre>)}{!errors.length && !policies.length ? <p className="emptyState">No logs recorded.</p> : null}</section>;
}

function RunPlanPane({ markdown }: { readonly markdown: string | undefined }): React.ReactNode {
  return <section className="runPanel"><h2>Plan</h2><pre className="planMarkdown">{markdown ?? "No Planfile projection recorded."}</pre></section>;
}

function KeyValue({ label, value }: { readonly label: string; readonly value: string }): React.ReactNode {
  return <div className="keyValue"><span>{label}</span><strong>{value}</strong></div>;
}

function headers(token: string): HeadersInit {
  return { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { body: text };
  }
}

function isMissingRun(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { readonly status?: unknown }).status === "missing");
}

function requestFailureMessage(status: number, data: unknown, route: string, source: string): string {
  const error = data && typeof data === "object" && "error" in data ? String((data as { readonly error?: unknown }).error) : "REQUEST_FAILED";
  const hint = error === "UNAUTHORIZED"
    ? "This is web/API bearer-token auth for the Run Console, not a web search provider error. Check the token field against OPEN_LAGRANGE_API_TOKEN in the web runtime."
    : "Check the web runtime logs for this route.";
  return [`HTTP ${status} ${error}`, `Source: ${source}`, `Route: ${route}`, hint, "", JSON.stringify(data, null, 2)].join("\n");
}

function snapshotRefreshMessage(snapshot: RunSnapshot): string {
  const latest = snapshot.timeline.at(-1);
  return [
    `Run snapshot: ${snapshot.status}`,
    snapshot.active_node_id ? `Active node: ${snapshot.active_node_id}` : "Active node: none",
    latest ? `Latest event: ${latest.type} - ${eventSummary(latest)}` : "Latest event: none",
    `Artifacts: ${snapshot.artifacts.length}`,
    `Next actions: ${snapshot.next_actions.length}`,
  ].join("\n");
}

function updateToken(value: string, setToken: (value: string) => void): void {
  setToken(value);
  if (value) window.sessionStorage.setItem("open-lagrange-api-token", value);
  else window.sessionStorage.removeItem("open-lagrange-api-token");
}

function readLocalUiState(runId: string): { readonly activeTab?: TabId; readonly selectedId?: string } {
  try {
    const raw = window.localStorage.getItem(`open-lagrange-run-ui:${runId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { readonly activeTab?: unknown; readonly selectedId?: unknown };
    return {
      ...(typeof parsed.activeTab === "string" && tabs.some((tab) => tab.id === parsed.activeTab) ? { activeTab: parsed.activeTab as TabId } : {}),
      ...(typeof parsed.selectedId === "string" ? { selectedId: parsed.selectedId } : {}),
    };
  } catch {
    return {};
  }
}

function writeLocalUiState(runId: string, state: { readonly activeTab: TabId; readonly selectedId: string }): void {
  window.localStorage.setItem(`open-lagrange-run-ui:${runId}`, JSON.stringify(state));
}

function removeUndefined(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, unknown] => entry[1] !== undefined));
}

interface SseFrame {
  readonly event: string;
  readonly data?: string;
  readonly id?: string;
}

async function* readSseFrames(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncIterable<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const raw of frames) {
        const parsed = parseSseFrame(raw);
        if (parsed) yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseFrame(raw: string): SseFrame | undefined {
  const lines = raw.split("\n");
  if (lines.every((line) => line.startsWith(":") || line.trim() === "")) return undefined;
  let event = "message";
  let id: string | undefined;
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith(":") || !line) continue;
    const index = line.indexOf(":");
    const field = index >= 0 ? line.slice(0, index) : line;
    const value = index >= 0 ? line.slice(index + 1).replace(/^ /, "") : "";
    if (field === "event") event = value;
    if (field === "id") id = value;
    if (field === "data") data.push(value);
  }
  return { event, ...(id ? { id } : {}), ...(data.length ? { data: data.join("\n") } : {}) };
}

function applyRunEventToSnapshot(snapshot: RunSnapshot, event: TimelineItem): RunSnapshot {
  if (snapshot.timeline.some((item) => item.event_id === event.event_id)) return snapshot;
  const timeline = [...snapshot.timeline, event].sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER) || left.timestamp.localeCompare(right.timestamp) || left.event_id.localeCompare(right.event_id));
  return { ...snapshot, timeline };
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

function statusTone(status: string): string {
  if (status.includes("failed") || status.includes("error")) return "bad";
  if (status.includes("yielded") || status.includes("requested") || status.includes("approval") || status.includes("cancelled")) return "warn";
  if (status.includes("completed") || status.includes("running")) return "good";
  return "neutral";
}

function terminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function eventTone(item: TimelineItem): string {
  if (item.type.endsWith(".failed")) return "error";
  if (item.type.endsWith(".completed")) return "success";
  if (item.type.endsWith(".yielded") || item.type.includes("approval") || item.type === "run.cancelled") return "warning";
  return "info";
}

function eventTitle(item: TimelineItem): string {
  const subject = item.node_id ?? item.artifact_id ?? item.approval_id ?? item.capability_ref ?? item.command_id;
  return subject ? `${item.type} · ${subject}` : item.type;
}

function eventSummary(item: TimelineItem): string {
  if (item.reason) return item.reason;
  if (item.decision) return `Decision: ${item.decision}`;
  if (typeof item.passed === "boolean") return item.passed ? "Verification passed." : "Verification failed.";
  if (item.status) return `Status: ${item.status}`;
  if (item.errors?.length) return item.errors.map((error) => error.message).join("; ");
  if (item.next_actions?.length) return `${item.next_actions.length} next action${item.next_actions.length === 1 ? "" : "s"}.`;
  return "Recorded.";
}

function recommendedPreset(snapshot: RunSnapshot | undefined): "research_packet" | "developer_packet" | "final_outputs" {
  const kinds = new Set(snapshot?.artifacts.map((artifact) => artifact.kind) ?? []);
  if (kinds.has("research_brief") || kinds.has("citation_index") || kinds.has("source_set")) return "research_packet";
  if (kinds.has("final_patch_artifact") || kinds.has("patch_artifact") || kinds.has("verification_report")) return "developer_packet";
  return "final_outputs";
}

function packetType(snapshot: RunSnapshot | undefined): "research" | "developer" | "general" {
  const preset = recommendedPreset(snapshot);
  if (preset === "research_packet") return "research";
  if (preset === "developer_packet") return "developer";
  return "general";
}

function digestStyle(snapshot: RunSnapshot | undefined): "research" | "developer" | "concise" {
  const preset = recommendedPreset(snapshot);
  if (preset === "research_packet") return "research";
  if (preset === "developer_packet") return "developer";
  return "concise";
}
