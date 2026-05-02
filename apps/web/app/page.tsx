"use client";

import { useEffect, useMemo, useState } from "react";

type ViewId = "home" | "planner" | "approvals" | "workflows" | "artifacts" | "packs" | "providers" | "schedules" | "runtime";

interface BuilderQuestion {
  readonly question_id: string;
  readonly severity: string;
  readonly question: string;
  readonly why_it_matters: string;
  readonly default_assumption?: string;
  readonly choices: readonly string[];
}

interface BuilderSession {
  readonly session_id: string;
  readonly status: string;
  readonly yield_reason?: string;
  readonly prompt_source?: string;
  readonly original_input?: string;
  readonly current_intent_frame?: { readonly domain?: string; readonly action?: string; readonly interpreted_goal?: string; readonly output_expectation?: { readonly kind?: string }; readonly schedule_intent?: { readonly requested?: boolean; readonly cadence?: string; readonly time_of_day?: string } };
  readonly current_planfile?: { readonly plan_id?: string; readonly status?: string; readonly nodes?: readonly { readonly id: string; readonly title: string }[] };
  readonly simulation_report?: { readonly status?: string; readonly required_packs?: readonly string[]; readonly required_providers?: readonly string[]; readonly approval_requirements?: readonly string[]; readonly warnings?: readonly string[]; readonly predicted_artifacts?: readonly string[] };
  readonly validation_report?: { readonly ok?: boolean; readonly issues?: readonly { readonly code?: string; readonly message?: string; readonly severity?: string }[] };
  readonly pending_questions: readonly BuilderQuestion[];
  readonly updated_at?: string;
  readonly planfile_markdown?: string;
}

interface PlanfileUpdateReport {
  readonly parse_status: string;
  readonly diff_status: string;
  readonly simulation_status: string;
  readonly validation_status: string;
  readonly builder_status: string;
  readonly regenerated_markdown?: string;
  readonly mermaid?: string;
  readonly validation_errors?: readonly { readonly code?: string; readonly message?: string }[];
  readonly simulation_warnings?: readonly string[];
  readonly questions?: readonly BuilderQuestion[];
  readonly diff?: PlanfileStructuredDiff;
}

interface PlanfileStructuredDiff {
  readonly nodes_added: readonly DiffNode[];
  readonly nodes_removed: readonly DiffNode[];
  readonly nodes_changed: readonly { readonly node_id: string; readonly changed_fields: readonly string[] }[];
  readonly edges_added: readonly { readonly from: string; readonly to: string; readonly reason?: string }[];
  readonly edges_removed: readonly { readonly from: string; readonly to: string; readonly reason?: string }[];
  readonly capabilities_added: readonly string[];
  readonly capabilities_removed: readonly string[];
  readonly requirements_changed: readonly { readonly kind: string; readonly before?: unknown; readonly after?: unknown }[];
  readonly risk_changes: readonly { readonly target: string; readonly before: string; readonly after: string; readonly increased: boolean }[];
  readonly approval_changes: readonly { readonly target: string; readonly before?: unknown; readonly after?: unknown }[];
  readonly schedule_changed?: { readonly before?: unknown; readonly after?: unknown };
  readonly parameters_changed?: readonly { readonly name: string; readonly before?: unknown; readonly after?: unknown }[];
}

interface DiffNode {
  readonly id: string;
  readonly title: string;
  readonly risk_level?: string;
  readonly approval_required?: boolean;
  readonly allowed_capability_refs?: readonly string[];
}

interface WorkbenchData {
  readonly runtime?: RuntimeSnapshot;
  readonly providers?: ProviderSnapshot;
  readonly sessions?: readonly SessionSummary[];
  readonly runs?: readonly RunSummary[];
  readonly artifacts?: readonly ArtifactSummary[];
  readonly schedules?: readonly ScheduleSummary[];
  readonly approvals?: readonly ApprovalSummary[];
  readonly packs?: readonly PackSummary[];
  readonly summary?: Record<string, number>;
}

interface RuntimeSnapshot {
  readonly profileName?: string;
  readonly mode?: string;
  readonly api?: ServiceStatus;
  readonly web?: ServiceStatus;
  readonly worker?: ServiceStatus;
  readonly hatchet?: ServiceStatus;
  readonly search?: ServiceStatus;
  readonly modelProvider?: ServiceStatus;
  readonly warnings?: readonly string[];
  readonly errors?: readonly string[];
  readonly status?: string;
  readonly message?: string;
}

interface ServiceStatus {
  readonly name?: string;
  readonly state?: string;
  readonly url?: string;
  readonly detail?: string;
}

interface ProviderSnapshot {
  readonly profile?: string;
  readonly active_model_provider?: string;
  readonly model_providers?: readonly { readonly id: string; readonly provider: string; readonly configured: boolean }[];
  readonly search_providers?: readonly { readonly id: string; readonly kind: string; readonly enabled: boolean }[];
  readonly secret_refs?: readonly string[];
}

interface SessionSummary {
  readonly session_id: string;
  readonly status: string;
  readonly prompt_source?: string;
  readonly plan_id?: string;
  readonly goal?: string;
  readonly pending_questions?: number;
  readonly updated_at?: string;
}

interface RunSummary {
  readonly run_id: string;
  readonly workflow_kind: string;
  readonly title: string;
  readonly summary: string;
  readonly status: string;
  readonly started_at: string;
  readonly completed_at?: string;
  readonly primary_artifact_refs?: readonly string[];
  readonly supporting_artifact_refs?: readonly string[];
}

interface ArtifactSummary {
  readonly artifact_id: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly created_at: string;
  readonly source_mode?: string;
  readonly execution_mode?: string;
  readonly path_or_uri?: string;
}

interface ScheduleSummary {
  readonly schedule_id: string;
  readonly plan_id: string;
  readonly cadence: string;
  readonly time_of_day?: string;
  readonly timezone: string;
  readonly status: string;
  readonly updated_at: string;
}

interface ApprovalSummary {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly related_plan_id?: string;
  readonly created_at: string;
  readonly status: string;
}

interface PackSummary {
  readonly pack_id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly { readonly capability_id: string; readonly name: string; readonly risk_level: string; readonly requires_approval: boolean }[];
}

const navItems: readonly { readonly id: ViewId; readonly label: string; readonly caption: string }[] = [
  { id: "home", label: "Home", caption: "Status and recent work" },
  { id: "planner", label: "Planner", caption: "Compose and edit Planfiles" },
  { id: "approvals", label: "Approvals", caption: "Review pending gates" },
  { id: "workflows", label: "Workflows", caption: "Runs and Plan Builder history" },
  { id: "artifacts", label: "Artifacts", caption: "Outputs and evidence" },
  { id: "packs", label: "Packs", caption: "Installed capabilities" },
  { id: "providers", label: "Providers", caption: "Models, search, secrets" },
  { id: "schedules", label: "Schedules", caption: "Planfile triggers" },
  { id: "runtime", label: "Runtime", caption: "Service health" },
];

export default function Page(): React.ReactNode {
  const [activeView, setActiveView] = useState<ViewId>("planner");
  const [workbench, setWorkbench] = useState<WorkbenchData | undefined>();
  const [prompt, setPrompt] = useState("Every morning, make me a cited brief on open source container security.");
  const [skillsMarkdown, setSkillsMarkdown] = useState("");
  const [session, setSession] = useState<BuilderSession | undefined>();
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [modelRoute, setModelRoute] = useState("");
  const [outputPath, setOutputPath] = useState(".open-lagrange/plans/plan-builder-output.plan.md");
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [apiToken, setApiToken] = useState("");
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [message, setMessage] = useState("");
  const [planMarkdown, setPlanMarkdown] = useState("");
  const [updateReport, setUpdateReport] = useState<PlanfileUpdateReport | undefined>();
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => session?.pending_questions.find((question) => question.question_id === selectedQuestion) ?? session?.pending_questions[0], [selectedQuestion, session]);
  const mermaid = useMemo(() => mermaidSource(session), [session]);
  const title = navItems.find((item) => item.id === activeView)?.label ?? "Workbench";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("plan_builder_session");
    if (sessionId) {
      setSessionIdInput(sessionId);
      void fetchSession(sessionId);
    }
    void refreshWorkbench();
  }, []);

  async function compose(): Promise<void> {
    await call("/api/plan-builder/sessions", { prompt, ...(skillsMarkdown.trim() ? { skills_markdown: skillsMarkdown } : {}) }, (data: BuilderSession) => {
      if (isBuilderSession(data)) {
        setSessionFromData(data);
        setActiveView("planner");
        void refreshWorkbench();
      } else {
        setMessage(`Unexpected response:\n${JSON.stringify(data, null, 2)}`);
      }
    });
  }

  async function refreshWorkbench(): Promise<void> {
    await getJson("/api/workbench", (data: WorkbenchData) => setWorkbench(data));
  }

  async function refreshSession(): Promise<void> {
    if (!session) return;
    await fetchSession(session.session_id);
  }

  async function answerQuestion(): Promise<void> {
    if (!session || !selected) return;
    await call(`/api/plan-builder/sessions/${session.session_id}/answer`, { question_id: selected.question_id, answer: answer || selected.default_assumption || selected.choices[0] || "accepted" }, setSessionFromData);
    setAnswer("");
  }

  async function sessionAction(action: "accept-defaults" | "revise" | "validate" | "save" | "run" | "schedule"): Promise<void> {
    if (!session) return;
    const body = action === "save"
      ? { output_path: outputPath }
      : action === "revise"
        ? { ...(modelRoute.trim() ? { model_route: modelRoute.trim() } : {}) }
      : action === "schedule"
        ? { cadence: "daily", time_of_day: scheduleTime }
        : {};
    await call(`/api/plan-builder/sessions/${session.session_id}/${action}`, body, (data) => {
      if (isBuilderSession(data)) setSessionFromData(data);
      setMessage(JSON.stringify(data, null, 2));
      void refreshWorkbench();
    });
  }

  async function reconcileEdits(): Promise<void> {
    if (!session || !planMarkdown.trim()) return;
    await call(`/api/plan-builder/sessions/${session.session_id}/update-planfile`, { markdown: planMarkdown }, (data: PlanfileUpdateReport) => {
      setUpdateReport(data);
      if (data.regenerated_markdown) setPlanMarkdown(data.regenerated_markdown);
      setMessage(JSON.stringify(data, null, 2));
    });
    await refreshSession();
    await refreshWorkbench();
  }

  async function getJson<T>(url: string, onData: (data: T) => void): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, { headers: apiHeaders(apiToken) });
      const data = await readResponseBody(response);
      if (!response.ok) {
        setMessage(requestFailureMessage(url, response.status, data));
        return;
      }
      onData(data as T);
    } catch (error) {
      setMessage(error instanceof Error ? `Request failed: ${error.message}` : `Request failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function call<T>(url: string, body: unknown, onData: (data: T) => void): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: apiHeaders(apiToken), body: JSON.stringify(body) });
      const data = await readResponseBody(response);
      if (!response.ok) {
        setMessage(requestFailureMessage(url, response.status, data));
        return;
      }
      onData(data as T);
    } catch (error) {
      setMessage(error instanceof Error ? `Request failed: ${error.message}` : `Request failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function fetchSession(sessionId: string): Promise<void> {
    await getJson(`/api/plan-builder/sessions/${sessionId}`, (data: BuilderSession) => {
      if (isBuilderSession(data)) setSessionFromData(data);
      else setMessage(`Unexpected response:\n${JSON.stringify(data, null, 2)}`);
    });
  }

  async function readResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { body: text };
    }
  }

  function requestFailureMessage(url: string, status: number, data: unknown): string {
    const error = data && typeof data === "object" && "error" in data ? String((data as { readonly error?: unknown }).error) : "REQUEST_FAILED";
    const hint = error === "UNAUTHORIZED"
      ? "The bearer token did not match OPEN_LAGRANGE_API_TOKEN in the web runtime."
      : error === "API_AUTH_NOT_CONFIGURED"
        ? "The web runtime does not have OPEN_LAGRANGE_API_TOKEN configured."
        : "Check the web runtime logs for the request trace.";
    return [`HTTP ${status} ${error}`, `Route: ${url}`, hint, "", JSON.stringify(data, null, 2)].join("\n");
  }

  function setSessionFromData(data: BuilderSession): void {
    setSession(data);
    setSessionIdInput(data.session_id);
    if (data.planfile_markdown) setPlanMarkdown(data.planfile_markdown);
  }

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">OL</div>
          <div>
            <strong>Open Lagrange</strong>
            <span>Control Plane</span>
          </div>
        </div>
        <nav className="navList" aria-label="Workbench navigation">
          {navItems.map((item) => (
            <button className={activeView === item.id ? "navItem active" : "navItem"} type="button" key={item.id} onClick={() => setActiveView(item.id)}>
              <span>{item.label}</span>
              <small>{item.caption}</small>
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{runtimeLine(workbench?.runtime)}</p>
            <h1>{title}</h1>
          </div>
          <div className="topbarActions">
            <input value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="API bearer token" />
            <button className="secondaryButton" type="button" onClick={refreshWorkbench} disabled={busy}>Refresh</button>
          </div>
        </header>

        {message ? <section className="notice"><pre>{message}</pre></section> : null}

        {activeView === "home" ? <HomeView workbench={workbench} onOpenPlanner={() => setActiveView("planner")} /> : null}
        {activeView === "planner" ? (
          <PlannerView
            prompt={prompt}
            setPrompt={setPrompt}
            skillsMarkdown={skillsMarkdown}
            setSkillsMarkdown={setSkillsMarkdown}
            session={session}
            sessionIdInput={sessionIdInput}
            setSessionIdInput={setSessionIdInput}
            fetchSession={fetchSession}
            selected={selected}
            selectedQuestion={selectedQuestion}
            setSelectedQuestion={setSelectedQuestion}
            answer={answer}
            setAnswer={setAnswer}
            answerQuestion={answerQuestion}
            modelRoute={modelRoute}
            setModelRoute={setModelRoute}
            outputPath={outputPath}
            setOutputPath={setOutputPath}
            scheduleTime={scheduleTime}
            setScheduleTime={setScheduleTime}
            planMarkdown={planMarkdown}
            setPlanMarkdown={setPlanMarkdown}
            updateReport={updateReport}
            mermaid={mermaid}
            busy={busy}
            compose={compose}
            refreshSession={refreshSession}
            reconcileEdits={reconcileEdits}
            sessionAction={sessionAction}
          />
        ) : null}
        {activeView === "approvals" ? <ApprovalsView approvals={workbench?.approvals ?? []} /> : null}
        {activeView === "workflows" ? <WorkflowsView sessions={workbench?.sessions ?? []} runs={workbench?.runs ?? []} /> : null}
        {activeView === "artifacts" ? <ArtifactsView artifacts={workbench?.artifacts ?? []} /> : null}
        {activeView === "packs" ? <PacksView packs={workbench?.packs ?? []} /> : null}
        {activeView === "providers" ? <ProvidersView providers={workbench?.providers} /> : null}
        {activeView === "schedules" ? <SchedulesView schedules={workbench?.schedules ?? []} /> : null}
        {activeView === "runtime" ? <RuntimeView runtime={workbench?.runtime} providers={workbench?.providers} /> : null}
      </main>
    </div>
  );
}

function HomeView({ workbench, onOpenPlanner }: { readonly workbench: WorkbenchData | undefined; readonly onOpenPlanner: () => void }): React.ReactNode {
  const summary = workbench?.summary ?? {};
  return (
    <div className="viewStack">
      <section className="heroPanel">
        <div>
          <p className="eyebrow">Plan / Run Workbench</p>
          <h2>Compose, review, run, and inspect reconciled work.</h2>
          <p>Planfiles, runs, approvals, artifacts, packs, providers, and schedules are available from one control surface.</p>
        </div>
        <button type="button" onClick={onOpenPlanner}>Open Planner</button>
      </section>
      <section className="metricGrid">
        <Metric label="Plans" value={summary.plans ?? 0} />
        <Metric label="Runs" value={summary.runs ?? 0} />
        <Metric label="Artifacts" value={summary.artifacts ?? 0} />
        <Metric label="Approvals" value={summary.approvals ?? 0} />
        <Metric label="Schedules" value={summary.schedules ?? 0} />
        <Metric label="Packs" value={summary.packs ?? 0} />
      </section>
      <section className="twoColumn">
        <Card title="Recent Plan Builder Sessions">
          <SessionList sessions={workbench?.sessions ?? []} />
        </Card>
        <Card title="Recent Runs">
          <RunList runs={workbench?.runs ?? []} />
        </Card>
      </section>
    </div>
  );
}

function PlannerView(input: {
  readonly prompt: string;
  readonly setPrompt: (value: string) => void;
  readonly skillsMarkdown: string;
  readonly setSkillsMarkdown: (value: string) => void;
  readonly session: BuilderSession | undefined;
  readonly sessionIdInput: string;
  readonly setSessionIdInput: (value: string) => void;
  readonly fetchSession: (sessionId: string) => Promise<void>;
  readonly selected: BuilderQuestion | undefined;
  readonly selectedQuestion: string;
  readonly setSelectedQuestion: (value: string) => void;
  readonly answer: string;
  readonly setAnswer: (value: string) => void;
  readonly answerQuestion: () => Promise<void>;
  readonly modelRoute: string;
  readonly setModelRoute: (value: string) => void;
  readonly outputPath: string;
  readonly setOutputPath: (value: string) => void;
  readonly scheduleTime: string;
  readonly setScheduleTime: (value: string) => void;
  readonly planMarkdown: string;
  readonly setPlanMarkdown: (value: string) => void;
  readonly updateReport: PlanfileUpdateReport | undefined;
  readonly mermaid: string;
  readonly busy: boolean;
  readonly compose: () => Promise<void>;
  readonly refreshSession: () => Promise<void>;
  readonly reconcileEdits: () => Promise<void>;
  readonly sessionAction: (action: "accept-defaults" | "revise" | "validate" | "save" | "run" | "schedule") => Promise<void>;
}): React.ReactNode {
  return (
    <div className="plannerGrid">
      <section className="panel spanTwo">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Planner</p>
            <h2>Compose a Planfile</h2>
          </div>
          <StatusPill value={input.session?.status ?? "idle"} />
        </div>
        <label htmlFor="prompt">Prompt</label>
        <textarea id="prompt" value={input.prompt} onChange={(event) => input.setPrompt(event.target.value)} rows={4} />
        <label htmlFor="skills">skills.md import</label>
        <textarea id="skills" value={input.skillsMarkdown} onChange={(event) => input.setSkillsMarkdown(event.target.value)} rows={4} placeholder="Optional skills.md content" />
        <div className="buttonRow">
          <button type="button" onClick={input.compose} disabled={input.busy || !input.prompt.trim()}>{input.busy ? "Working..." : "Compose"}</button>
          <button className="secondaryButton" type="button" onClick={() => input.sessionAction("revise")} disabled={input.busy || !input.session}>Revise</button>
          <button className="secondaryButton" type="button" onClick={() => input.sessionAction("validate")} disabled={input.busy || !input.session}>Validate</button>
          <button className="secondaryButton" type="button" onClick={() => input.sessionAction("accept-defaults")} disabled={input.busy || !input.session}>Accept Defaults</button>
        </div>
      </section>

      <section className="panel">
        <h2>Load Session</h2>
        <input value={input.sessionIdInput} onChange={(event) => input.setSessionIdInput(event.target.value)} placeholder="builder session id" />
        <div className="buttonRow">
          <button className="secondaryButton" type="button" onClick={() => input.fetchSession(input.sessionIdInput)} disabled={input.busy || !input.sessionIdInput.trim()}>Load</button>
          <button className="secondaryButton" type="button" onClick={input.refreshSession} disabled={input.busy || !input.session}>Refresh</button>
        </div>
      </section>

      <section className="panel">
        <h2>Intent</h2>
        <KeyValue label="Session" value={input.session?.session_id ?? "none"} />
        <KeyValue label="Domain" value={input.session?.current_intent_frame?.domain ?? "unknown"} />
        <KeyValue label="Action" value={input.session?.current_intent_frame?.action ?? "unknown"} />
        <KeyValue label="Output" value={input.session?.current_intent_frame?.output_expectation?.kind ?? "unknown"} />
        <p className="mutedText">{input.session?.current_intent_frame?.interpreted_goal ?? "No active intent."}</p>
      </section>

      <section className="panel">
        <h2>Questions</h2>
        {input.session?.pending_questions.length ? input.session.pending_questions.map((question) => (
          <button className={input.selectedQuestion === question.question_id ? "questionButton active" : "questionButton"} type="button" key={question.question_id} onClick={() => input.setSelectedQuestion(question.question_id)}>
            <span>{question.severity}</span>
            {question.question}
          </button>
        )) : <EmptyState label="No pending questions." />}
        {input.selected ? (
          <div className="questionDetail">
            <h3>{input.selected.question}</h3>
            <p>{input.selected.why_it_matters}</p>
            <input value={input.answer} onChange={(event) => input.setAnswer(event.target.value)} placeholder={input.selected.choices.join(" / ")} />
            <button className="secondaryButton" type="button" onClick={input.answerQuestion} disabled={input.busy}>Answer</button>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>Requirements</h2>
        <KeyValue label="Simulation" value={input.session?.simulation_report?.status ?? "none"} />
        <KeyValue label="Packs" value={list(input.session?.simulation_report?.required_packs)} />
        <KeyValue label="Providers" value={list(input.session?.simulation_report?.required_providers)} />
        <KeyValue label="Approvals" value={list(input.session?.simulation_report?.approval_requirements)} />
      </section>

      <section className="panel">
        <h2>Validation</h2>
        <KeyValue label="Status" value={input.session?.validation_report?.ok === true ? "passed" : input.session?.validation_report?.ok === false ? "failed" : "not run"} />
        <List items={(input.session?.validation_report?.issues ?? []).map((issue) => `${issue.severity ?? "issue"} ${issue.code ?? ""}: ${issue.message ?? ""}`)} empty="No validation issues." />
      </section>

      <section className="panel spanTwo">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Editable Markdown</p>
            <h2>Planfile</h2>
          </div>
          <button type="button" onClick={input.reconcileEdits} disabled={input.busy || !input.session || !input.planMarkdown.trim()}>Reconcile Edits</button>
        </div>
        <textarea className="codeEditor" value={input.planMarkdown || JSON.stringify(input.session?.current_planfile ?? {}, null, 2)} onChange={(event) => input.setPlanMarkdown(event.target.value)} rows={20} />
        <div className="buttonRow">
          <input value={input.outputPath} onChange={(event) => input.setOutputPath(event.target.value)} />
          <button className="secondaryButton" type="button" onClick={() => input.sessionAction("save")} disabled={input.busy || !input.session}>Save</button>
          <button className="secondaryButton" type="button" onClick={() => input.sessionAction("run")} disabled={input.busy || !input.session}>Run Now</button>
        </div>
      </section>

      <section className="panel">
        <h2>DAG</h2>
        <pre>{input.updateReport?.mermaid ?? input.mermaid}</pre>
        <input value={input.scheduleTime} onChange={(event) => input.setScheduleTime(event.target.value)} />
        <button className="secondaryButton fullWidth" type="button" onClick={() => input.sessionAction("schedule")} disabled={input.busy || !input.session}>Schedule Daily</button>
      </section>

      <section className="panel spanThree">
        <h2>Reconciliation Diff</h2>
        {input.updateReport ? (
          <>
            <div className="statusStrip">
              <StatusPill value={`parse ${input.updateReport.parse_status}`} />
              <StatusPill value={`diff ${input.updateReport.diff_status}`} />
              <StatusPill value={`validation ${input.updateReport.validation_status}`} />
              <StatusPill value={`simulation ${input.updateReport.simulation_status}`} />
            </div>
            <List title="Validation Errors" items={(input.updateReport.validation_errors ?? []).map((error) => `${error.code ?? "ERROR"}: ${error.message ?? ""}`)} empty="No validation errors." />
            {input.updateReport.diff ? <DiffSummary diff={input.updateReport.diff} /> : <EmptyState label="No structured diff available." />}
          </>
        ) : <EmptyState label="No edit reconciliation has run." />}
      </section>
    </div>
  );
}

function ApprovalsView({ approvals }: { readonly approvals: readonly ApprovalSummary[] }): React.ReactNode {
  return <Card title="Approvals">{approvals.length ? approvals.map((item) => <RecordCard key={item.id} title={item.title} meta={`${item.status} · ${formatDate(item.created_at)}`} body={item.summary} />) : <EmptyState label="No approval requests found." />}</Card>;
}

function WorkflowsView({ sessions, runs }: { readonly sessions: readonly SessionSummary[]; readonly runs: readonly RunSummary[] }): React.ReactNode {
  return (
    <section className="twoColumn">
      <Card title="Plan Builder Sessions"><SessionList sessions={sessions} /></Card>
      <Card title="Runs"><RunList runs={runs} /></Card>
    </section>
  );
}

function ArtifactsView({ artifacts }: { readonly artifacts: readonly ArtifactSummary[] }): React.ReactNode {
  return <Card title="Artifacts">{artifacts.length ? artifacts.map((artifact) => <RecordCard key={artifact.artifact_id} title={artifact.title} meta={`${artifact.kind} · ${artifact.source_mode ?? artifact.execution_mode ?? "live"} · ${formatDate(artifact.created_at)}`} body={artifact.summary} />) : <EmptyState label="No artifacts indexed." />}</Card>;
}

function PacksView({ packs }: { readonly packs: readonly PackSummary[] }): React.ReactNode {
  return <Card title="Installed Packs">{packs.length ? packs.map((pack) => <RecordCard key={pack.pack_id} title={`${pack.name} · ${pack.capabilities.length} capabilities`} meta={pack.pack_id} body={pack.description} />) : <EmptyState label="No packs reported." />}</Card>;
}

function ProvidersView({ providers }: { readonly providers: ProviderSnapshot | undefined }): React.ReactNode {
  return (
    <section className="twoColumn">
      <Card title="Model Providers">
        <KeyValue label="Profile" value={providers?.profile ?? "unknown"} />
        <KeyValue label="Active" value={providers?.active_model_provider ?? "not configured"} />
        <List items={(providers?.model_providers ?? []).map((provider) => `${provider.id}: ${provider.provider} (${provider.configured ? "configured" : "missing"})`)} empty="No model providers configured." />
      </Card>
      <Card title="Search Providers">
        <List items={(providers?.search_providers ?? []).map((provider) => `${provider.id}: ${provider.kind} (${provider.enabled ? "enabled" : "disabled"})`)} empty="No search providers configured." />
        <List title="Secret References" items={providers?.secret_refs ?? []} empty="No secret refs recorded." />
      </Card>
    </section>
  );
}

function SchedulesView({ schedules }: { readonly schedules: readonly ScheduleSummary[] }): React.ReactNode {
  return <Card title="Schedules">{schedules.length ? schedules.map((schedule) => <RecordCard key={schedule.schedule_id} title={`${schedule.cadence}${schedule.time_of_day ? ` at ${schedule.time_of_day}` : ""}`} meta={`${schedule.status} · ${schedule.plan_id}`} body={`${schedule.timezone} · ${formatDate(schedule.updated_at)}`} />) : <EmptyState label="No schedules configured." />}</Card>;
}

function RuntimeView({ runtime, providers }: { readonly runtime: RuntimeSnapshot | undefined; readonly providers: ProviderSnapshot | undefined }): React.ReactNode {
  return (
    <section className="twoColumn">
      <Card title="Runtime">
        <KeyValue label="Profile" value={runtime?.profileName ?? providers?.profile ?? "unknown"} />
        <KeyValue label="Mode" value={runtime?.mode ?? "unknown"} />
        <ServiceRow service={runtime?.api} fallback="api" />
        <ServiceRow service={runtime?.web} fallback="web" />
        <ServiceRow service={runtime?.worker} fallback="worker" />
        <ServiceRow service={runtime?.hatchet} fallback="hatchet" />
        <ServiceRow service={runtime?.search} fallback="search" />
      </Card>
      <Card title="Runtime Messages">
        <List title="Warnings" items={runtime?.warnings ?? []} empty="No warnings." />
        <List title="Errors" items={runtime?.errors ?? []} empty="No errors." />
      </Card>
    </section>
  );
}

function ServiceRow({ service, fallback }: { readonly service: ServiceStatus | undefined; readonly fallback: string }): React.ReactNode {
  return <KeyValue label={service?.name ?? fallback} value={service?.state ?? "unknown"} />;
}

function SessionList({ sessions }: { readonly sessions: readonly SessionSummary[] }): React.ReactNode {
  return sessions.length ? sessions.map((session) => <RecordCard key={session.session_id} title={session.goal ?? session.plan_id ?? session.session_id} meta={`${session.status} · ${session.pending_questions ?? 0} question(s) · ${formatDate(session.updated_at)}`} body={session.session_id} />) : <EmptyState label="No Plan Builder sessions yet." />;
}

function RunList({ runs }: { readonly runs: readonly RunSummary[] }): React.ReactNode {
  return runs.length ? runs.map((run) => <RecordCard key={run.run_id} title={run.title} meta={`${run.workflow_kind} · ${run.status} · ${formatDate(run.started_at)}`} body={run.summary} />) : <EmptyState label="No workflow runs indexed." />;
}

function Metric({ label, value }: { readonly label: string; readonly value: number }): React.ReactNode {
  return <div className="metricCard"><span>{label}</span><strong>{value}</strong></div>;
}

function Card({ title, children }: { readonly title: string; readonly children: React.ReactNode }): React.ReactNode {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

function RecordCard({ title, meta, body }: { readonly title: string; readonly meta: string; readonly body: string }): React.ReactNode {
  return <article className="recordCard"><div><h3>{title}</h3><span>{meta}</span></div><p>{body}</p></article>;
}

function KeyValue({ label, value }: { readonly label: string; readonly value: string }): React.ReactNode {
  return <div className="keyValue"><span>{label}</span><strong>{value}</strong></div>;
}

function StatusPill({ value }: { readonly value: string }): React.ReactNode {
  return <span className={`statusPill ${statusTone(value)}`}>{value}</span>;
}

function EmptyState({ label }: { readonly label: string }): React.ReactNode {
  return <p className="emptyState">{label}</p>;
}

function List({ items, empty, title }: { readonly items: readonly string[]; readonly empty: string; readonly title?: string }): React.ReactNode {
  return (
    <div className="listBlock">
      {title ? <h3>{title}</h3> : null}
      {items.length ? <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <EmptyState label={empty} />}
    </div>
  );
}

function DiffSummary({ diff }: { readonly diff: PlanfileStructuredDiff }): React.ReactNode {
  const riskIncreases = diff.risk_changes.filter((change) => change.increased);
  return (
    <div className="diffGrid">
      <DiffCard title="Nodes Added" items={diff.nodes_added.map((node) => `${node.id}: ${node.title}`)} />
      <DiffCard title="Nodes Removed" items={diff.nodes_removed.map((node) => `${node.id}: ${node.title}`)} />
      <DiffCard title="Nodes Changed" items={diff.nodes_changed.map((node) => `${node.node_id}: ${node.changed_fields.join(", ")}`)} />
      <DiffCard title="Capabilities" items={[...diff.capabilities_added.map((item) => `+ ${item}`), ...diff.capabilities_removed.map((item) => `- ${item}`)]} />
      <DiffCard title="Risk Increases" tone={riskIncreases.length > 0 ? "attention" : "neutral"} items={riskIncreases.map((change) => `${change.target}: ${change.before} -> ${change.after}`)} />
      <DiffCard title="Approval Changes" items={diff.approval_changes.map((change) => `${change.target}: ${stringValue(change.before)} -> ${stringValue(change.after)}`)} />
      <DiffCard title="Requirements" items={diff.requirements_changed.map((change) => `${change.kind}: ${stringValue(change.before)} -> ${stringValue(change.after)}`)} />
      <DiffCard title="Schedule" tone={diff.schedule_changed ? "attention" : "neutral"} items={diff.schedule_changed ? [`${stringValue(diff.schedule_changed.before)} -> ${stringValue(diff.schedule_changed.after)}`] : []} />
      <DiffCard title="Parameters" items={(diff.parameters_changed ?? []).map((change) => `${change.name}: ${stringValue(change.before)} -> ${stringValue(change.after)}`)} />
      <DiffCard title="Edges" items={[...diff.edges_added.map((edge) => `+ ${edge.from} -> ${edge.to}`), ...diff.edges_removed.map((edge) => `- ${edge.from} -> ${edge.to}`)]} />
    </div>
  );
}

function DiffCard({ title, items, tone = "neutral" }: { readonly title: string; readonly items: readonly string[]; readonly tone?: "neutral" | "attention" }): React.ReactNode {
  return (
    <div className={`diffCard ${tone}`}>
      <div className="diffCardHead"><h3>{title}</h3><span>{items.length}</span></div>
      {items.length ? <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <p>None.</p>}
    </div>
  );
}

function apiHeaders(apiToken: string): HeadersInit {
  return { "content-type": "application/json", ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {}) };
}

function isBuilderSession(value: unknown): value is BuilderSession {
  return Boolean(value && typeof value === "object" && "session_id" in value);
}

function list(values: readonly string[] | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "none";
}

function mermaidSource(session: BuilderSession | undefined): string {
  const nodes = session?.current_planfile?.nodes ?? [];
  if (nodes.length === 0) return "flowchart TD\n  empty[No Planfile yet]";
  return ["flowchart TD", ...nodes.map((node) => `  ${node.id}[${node.title.replace(/[\[\]]/g, "")}]`)].join("\n");
}

function runtimeLine(runtime: RuntimeSnapshot | undefined): string {
  if (!runtime) return "Runtime not loaded";
  return `${runtime.profileName ?? "unknown"} · ${runtime.api?.state ?? runtime.status ?? "unknown"}`;
}

function statusTone(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes("failed") || lower.includes("error") || lower.includes("unreachable")) return "bad";
  if (lower.includes("needs") || lower.includes("pending") || lower.includes("yielded") || lower.includes("approval")) return "attention";
  if (lower.includes("ready") || lower.includes("running") || lower.includes("passed") || lower.includes("completed")) return "good";
  return "neutral";
}

function stringValue(value: unknown): string {
  if (value === undefined) return "none";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatDate(value: string | undefined): string {
  if (!value) return "unknown";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}
