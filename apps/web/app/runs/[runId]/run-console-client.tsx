"use client";

import { useEffect, useMemo, useState } from "react";

type TabId = "overview" | "timeline" | "artifacts" | "approvals" | "model_calls" | "logs" | "plan";

interface RunSnapshot {
  readonly run_id: string;
  readonly plan_id: string;
  readonly builder_session_id?: string;
  readonly plan_title: string;
  readonly status: string;
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
  readonly title: string;
  readonly summary: string;
  readonly node_id?: string;
  readonly artifact_id?: string;
  readonly approval_id?: string;
  readonly severity: "info" | "success" | "warning" | "error";
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
  readonly model_call_artifact_id: string;
  readonly title: string;
  readonly summary: string;
  readonly node_id?: string;
}

interface PolicyReportItem {
  readonly event_id: string;
  readonly node_id?: string;
  readonly capability_ref?: string;
  readonly outcome: string;
  readonly reason: string;
}

interface ErrorItem {
  readonly error_id: string;
  readonly node_id?: string;
  readonly message: string;
}

interface NextAction {
  readonly label: string;
  readonly command: string;
  readonly action_type: string;
  readonly required: boolean;
}

const tabs: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "artifacts", label: "Artifacts" },
  { id: "approvals", label: "Approvals" },
  { id: "model_calls", label: "Model Calls" },
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

  const selectedNode = useMemo(() => snapshot?.nodes.find((node) => node.node_id === (selectedId || snapshot.active_node_id)), [selectedId, snapshot]);
  const selectedArtifact = useMemo(() => snapshot?.artifacts.find((artifact) => artifact.artifact_id === selectedId), [selectedId, snapshot]);
  const activeNode = snapshot?.nodes.find((node) => node.node_id === snapshot.active_node_id);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("open-lagrange-api-token") ?? "";
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
    void streamRun(controller.signal);
    return () => controller.abort();
  }, [runId, token, tokenLoaded]);

  useEffect(() => {
    writeLocalUiState(runId, { activeTab, selectedId });
    const timeout = window.setTimeout(() => {
      void mutateUiState({
        active_tab: activeTab,
        selected_node_id: snapshot?.nodes.some((node) => node.node_id === selectedId) ? selectedId : undefined,
        selected_artifact_id: snapshot?.artifacts.some((artifact) => artifact.artifact_id === selectedId) ? selectedId : undefined,
        selected_approval_id: snapshot?.approvals.some((approval) => approval.approval_id === selectedId) ? selectedId : undefined,
        selected_model_call_id: snapshot?.model_calls.some((call) => call.model_call_artifact_id === selectedId) ? selectedId : undefined,
        last_viewed_event_id: lastEventId || undefined,
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [activeTab, selectedId, lastEventId, runId]);

  async function streamRun(signal: AbortSignal): Promise<void> {
    try {
      const suffix = lastEventId ? `?cursor=${encodeURIComponent(lastEventId)}` : "";
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/stream${suffix}`, { headers: headers(token), signal });
      if (!response.ok || !response.body) {
        const data = await readBody(response);
        setMessage(requestFailureMessage(response.status, data, `/api/runs/${runId}/stream`, "Run Console event stream"));
        await refresh(true, token);
        return;
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) handleSseFrame(frame);
      }
    } catch (error) {
      if (!signal.aborted) void refresh(true);
    }
  }

  function handleSseFrame(frame: string): void {
    const lines = frame.split("\n");
    const event = lines.find((line) => line.startsWith("event: "))?.slice(7) ?? "message";
    const id = lines.find((line) => line.startsWith("id: "))?.slice(4);
    const dataLine = lines.find((line) => line.startsWith("data: "));
    if (!dataLine) return;
    const data = JSON.parse(dataLine.slice(6)) as unknown;
    if (id) setLastEventId(id);
    if (event === "run.snapshot" && data && typeof data === "object" && "run_id" in data) setSnapshot(data as RunSnapshot);
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
      setMessage(action.command);
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

  return (
    <main className="runConsole">
      <nav className="runTopNav" aria-label="Run Console navigation">
        <a href="/">Workbench</a>
        <a href="/?view=planner">Planner</a>
        <a href="/?view=workflows">Runs</a>
        <a href="/?view=providers">Providers</a>
      </nav>
      <RunHeader snapshot={snapshot} runId={runId} token={token} setToken={setToken} refresh={() => refresh()} cancel={cancel} busy={busy} />
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
          {activeTab === "logs" ? <RunLogsPanel errors={snapshot?.errors ?? []} policies={snapshot?.policy_reports ?? []} /> : null}
          {activeTab === "plan" ? <RunPlanPane markdown={snapshot?.plan_markdown} /> : null}
        </div>
        <RunDetailPane node={selectedNode ?? activeNode} artifact={selectedArtifact} snapshot={snapshot} />
      </section>
    </main>
  );
}

function RunHeader(input: { readonly snapshot: RunSnapshot | undefined; readonly runId: string; readonly token: string; readonly setToken: (value: string) => void; readonly refresh: () => void; readonly cancel: () => void; readonly busy: boolean }): React.ReactNode {
  return (
    <header className="runHeader">
      <div>
        <p className="eyebrow">Run Console</p>
        <h1>{input.snapshot?.plan_title ?? input.runId}</h1>
        <div className="statusStrip">
          <span className={`statusPill ${statusTone(input.snapshot?.status ?? "pending")}`}>{input.snapshot?.status ?? "loading"}</span>
          <span>{input.snapshot?.active_node_id ? `Active node: ${input.snapshot.active_node_id}` : "No active node"}</span>
          <span>{input.snapshot?.started_at ?? ""}</span>
        </div>
      </div>
      <div className="tokenTools">
        <input value={input.token} onChange={(event) => updateToken(event.target.value, input.setToken)} placeholder="API bearer token" />
        <button type="button" onClick={input.refresh} disabled={input.busy}>Refresh</button>
        <button type="button" onClick={input.cancel} disabled={input.busy || !input.snapshot || input.snapshot.status === "completed" || input.snapshot.status === "failed"}>Cancel</button>
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
  return <section className="runPanel"><h2>Timeline</h2>{items.length ? items.map((item) => <article key={item.event_id} className={`timelineItem ${item.severity}`}><span>{item.timestamp}</span><strong>{item.title}</strong><p>{item.summary}</p></article>) : <p className="emptyState">No events recorded.</p>}</section>;
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
  return <section className="runPanel"><h2>Model Calls</h2>{calls.length ? calls.map((call) => <article key={call.model_call_artifact_id} className="recordCard"><h3>{call.title}</h3><p>{call.summary}</p><span>{call.node_id ?? "run"}</span></article>) : <p className="emptyState">No model calls recorded.</p>}</section>;
}

function RunLogsPanel({ errors, policies }: { readonly errors: readonly ErrorItem[]; readonly policies: readonly PolicyReportItem[] }): React.ReactNode {
  return <section className="runPanel"><h2>Logs</h2>{errors.map((error) => <pre key={error.error_id} className="logLine">{error.node_id ? `${error.node_id}: ` : ""}{error.message}</pre>)}{policies.map((policy) => <pre key={policy.event_id} className="logLine">{policy.node_id ?? "run"} policy {policy.outcome}: {policy.reason}</pre>)}{!errors.length && !policies.length ? <p className="emptyState">No logs recorded.</p> : null}</section>;
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
    latest ? `Latest event: ${latest.type} - ${latest.summary}` : "Latest event: none",
    `Artifacts: ${snapshot.artifacts.length}`,
    `Next actions: ${snapshot.next_actions.length}`,
  ].join("\n");
}

function updateToken(value: string, setToken: (value: string) => void): void {
  setToken(value);
  if (value) window.localStorage.setItem("open-lagrange-api-token", value);
  else window.localStorage.removeItem("open-lagrange-api-token");
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

function statusTone(status: string): string {
  if (status.includes("failed") || status.includes("error")) return "bad";
  if (status.includes("yielded") || status.includes("requested")) return "warn";
  if (status.includes("completed") || status.includes("running")) return "good";
  return "neutral";
}
