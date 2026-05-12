"use client";

import { useEffect, useState } from "react";

type LiveState = "connected" | "reconnecting" | "polling fallback" | "disconnected";

interface RepositoryRunView {
  readonly run_id: string;
  readonly plan_id: string;
  readonly repo_root: string;
  readonly worktree_path?: string;
  readonly branch_name?: string;
  readonly base_ref?: string;
  readonly base_commit?: string;
  readonly worktree_status?: string;
  readonly goal: { readonly original_prompt?: string; readonly interpreted_goal?: string; readonly acceptance_criteria: readonly string[]; readonly non_goals: readonly string[]; readonly assumptions: readonly string[] };
  readonly status: string;
  readonly current_phase?: string;
  readonly phases: readonly { readonly phase_id: string; readonly label: string; readonly status: string; readonly summary: string; readonly artifact_refs: readonly string[] }[];
  readonly files: { readonly inspected: readonly { readonly path: string; readonly reason?: string }[]; readonly changed: readonly { readonly path: string }[]; readonly denied: readonly { readonly path: string; readonly reason: string }[] };
  readonly evidence: readonly { readonly evidence_bundle_id: string; readonly files: readonly { readonly path: string; readonly reason?: string }[]; readonly findings: readonly string[]; readonly notes: readonly string[] }[];
  readonly patch_plans: readonly { readonly patch_plan_id: string; readonly summary: string; readonly operations: readonly { readonly kind: string; readonly relative_path: string; readonly rationale: string }[]; readonly expected_changed_files: readonly string[]; readonly risk_level: string; readonly approval_required: boolean }[];
  readonly patch_artifacts: readonly { readonly patch_artifact_id: string; readonly changed_files: readonly string[]; readonly unified_diff: string; readonly apply_status: string }[];
  readonly verification_reports: readonly { readonly verification_report_id: string; readonly passed: boolean; readonly command_results: readonly { readonly command_id: string; readonly status: string; readonly exit_code: number | null; readonly stdout_preview: string; readonly stderr_preview: string; readonly raw_artifact_id?: string }[]; readonly failures: readonly { readonly summary: string }[] }[];
  readonly repair_attempts: readonly { readonly repair_attempt_id: string; readonly attempt: number; readonly failure_summary: string; readonly status: string; readonly decision: string; readonly decision_reason: string }[];
  readonly scope_expansion_requests: readonly { readonly request_id: string; readonly approval_status: string; readonly reason: string; readonly requested_files: readonly string[]; readonly requested_capabilities: readonly string[]; readonly requested_verification_commands: readonly string[]; readonly suggested_approve_command: string; readonly suggested_reject_command: string }[];
  readonly review_report?: { readonly title: string; readonly summary: string; readonly risk_notes: readonly string[]; readonly followups: readonly string[] };
  readonly final_patch?: { readonly artifact_id: string; readonly changed_files: readonly string[]; readonly unified_diff: string; readonly export_command: string; readonly apply_command: string };
  readonly model_calls: readonly { readonly artifact_id: string; readonly role: string; readonly model: string; readonly summary: string }[];
  readonly warnings: readonly string[];
  readonly next_actions: readonly { readonly action_id: string; readonly label: string; readonly command?: string }[];
}

export default function RepositoryRunClient({ runId }: { readonly runId: string }): React.ReactNode {
  const [view, setView] = useState<RepositoryRunView | undefined>();
  const [liveState, setLiveState] = useState<LiveState>("disconnected");
  const [activeTab, setActiveTab] = useState<"overview" | "evidence" | "patch" | "diff" | "verification" | "repair" | "scope" | "review" | "model_calls">("overview");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void refresh();
    const controller = new AbortController();
    void stream(controller.signal);
    return () => controller.abort();
  }, [runId]);

  async function refresh(): Promise<void> {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/repository`);
    const data = await response.json() as RepositoryRunView | { readonly error?: string; readonly status?: string };
    if (!response.ok || responseError(data)) throw new Error(responseError(data) ?? "Unable to load repository run.");
    setView(data as RepositoryRunView);
  }

  async function stream(signal: AbortSignal): Promise<void> {
    let failures = 0;
    while (!signal.aborted) {
      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/events/stream`, { signal });
        if (!response.ok || !response.body) throw new Error(`Event stream failed: ${response.status}`);
        failures = 0;
        setLiveState("connected");
        for await (const _frame of readSseFrames(response.body, signal)) {
          void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : String(error)));
        }
      } catch (error) {
        if (signal.aborted) return;
        failures += 1;
        setLiveState(failures >= 3 ? "polling fallback" : "reconnecting");
        setMessage(error instanceof Error ? error.message : String(error));
        await refresh().catch(() => undefined);
        await sleep(Math.min(10_000, 500 * (2 ** Math.min(failures, 5))), signal);
      }
    }
  }

  return (
    <main className="repo-page">
      <header className="repo-header">
        <div>
          <p className="eyebrow">Repository Workbench</p>
          <h1>{view?.goal.interpreted_goal ?? view?.goal.original_prompt ?? runId}</h1>
          <p>Status: <strong>{view?.status ?? "loading"}</strong> | Live: {liveState} | Phase: {view?.current_phase ?? "waiting"}</p>
          <p>{view?.repo_root ?? ""}</p>
        </div>
        <a href={`/runs/${encodeURIComponent(runId)}`}>Run Console</a>
      </header>
      {message ? <p className="message">{message}</p> : null}
      <nav className="tabs">
        {(["overview", "evidence", "patch", "diff", "verification", "repair", "scope", "review", "model_calls"] as const).map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab.replace("_", " ")}</button>
        ))}
      </nav>
      {view ? (
        <section className="layout">
          <aside className="panel">
            <h2>Worktree</h2>
            <p>{view.worktree_path ?? "not created yet"}</p>
            <p>{view.branch_name ? `branch: ${view.branch_name}` : ""}</p>
            <p>{view.base_ref || view.base_commit ? `base: ${[view.base_ref, view.base_commit].filter(Boolean).join("@")}` : ""}</p>
            <h2>Phases</h2>
            <ol>{view.phases.map((phase) => <li key={phase.phase_id}><strong>{phase.status}</strong> {phase.label}</li>)}</ol>
            <List title="Next Actions" items={view.next_actions.map((action) => action.command ?? action.label)} />
          </aside>
          <section className="panel main">
            {activeTab === "overview" ? <Overview view={view} /> : null}
            {activeTab === "evidence" ? <Evidence view={view} /> : null}
            {activeTab === "patch" ? <PatchPlans view={view} /> : null}
            {activeTab === "diff" ? <Diff view={view} /> : null}
            {activeTab === "verification" ? <Verification view={view} /> : null}
            {activeTab === "repair" ? <Repair view={view} /> : null}
            {activeTab === "scope" ? <Scope view={view} /> : null}
            {activeTab === "review" ? <Review view={view} /> : null}
            {activeTab === "model_calls" ? <List title="Model Calls" items={view.model_calls.map((call) => `${call.role}: ${call.model} (${call.artifact_id})`)} /> : null}
          </section>
        </section>
      ) : <section className="panel">Loading repository run...</section>}
      <style jsx>{`
        .repo-page { padding: 28px; min-height: 100vh; background: #f6f7f8; color: #172026; }
        .repo-header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 16px; }
        .eyebrow { text-transform: uppercase; font-size: 12px; color: #59636b; }
        h1 { margin: 0; font-size: 28px; }
        h2 { font-size: 16px; margin: 0 0 8px; }
        .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
        button { border: 1px solid #c8cfd6; border-radius: 6px; background: #fff; padding: 8px 10px; cursor: pointer; text-transform: capitalize; }
        button.active { background: #263b4a; color: #fff; border-color: #263b4a; }
        .layout { display: grid; grid-template-columns: 300px 1fr; gap: 16px; }
        .panel { background: #fff; border: 1px solid #d8dde2; border-radius: 8px; padding: 16px; }
        .main { min-width: 0; }
        pre { white-space: pre-wrap; background: #101817; color: #edf3f1; padding: 14px; border-radius: 6px; overflow: auto; }
        .message { color: #8a4b0f; }
        @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .repo-page { padding: 18px; } }
      `}</style>
    </main>
  );
}

function Overview({ view }: { readonly view: RepositoryRunView }): React.ReactNode {
  return (
    <div>
      <h2>Goal</h2>
      <p>{view.goal.interpreted_goal ?? view.goal.original_prompt ?? view.plan_id}</p>
      <List title="Acceptance Criteria" items={view.goal.acceptance_criteria} />
      <List title="Changed Files" items={view.files.changed.map((file) => file.path)} />
      <List title="Warnings" items={view.warnings} />
    </div>
  );
}

function Evidence({ view }: { readonly view: RepositoryRunView }): React.ReactNode {
  return <List title="Inspected Files" items={view.files.inspected.map((file) => `${file.path}${file.reason ? `: ${file.reason}` : ""}`)} />;
}

function PatchPlans({ view }: { readonly view: RepositoryRunView }): React.ReactNode {
  const latest = view.patch_plans.at(-1);
  if (!latest) return <p>No PatchPlan recorded yet.</p>;
  return <div><h2>{latest.summary}</h2><List title="Operations" items={latest.operations.map((operation) => `${operation.kind} ${operation.relative_path}: ${operation.rationale}`)} /></div>;
}

function Diff({ view }: { readonly view: RepositoryRunView }): React.ReactNode {
  const diff = view.final_patch?.unified_diff ?? view.patch_artifacts.at(-1)?.unified_diff;
  return diff ? <pre>{diff}</pre> : <p>No diff recorded yet.</p>;
}

function Verification({ view }: { readonly view: RepositoryRunView }): React.ReactNode {
  return <List title="Verification" items={view.verification_reports.flatMap((report) => [`${report.verification_report_id}: ${report.passed ? "passed" : "failed"}`, ...report.command_results.map((result) => `${result.command_id}: ${result.status}${result.exit_code === null ? "" : ` (${result.exit_code})`}${result.stderr_preview ? ` - ${result.stderr_preview}` : ""}`)])} />;
}

function Repair({ view }: { readonly view: RepositoryRunView }): React.ReactNode {
  return <List title="Repair Attempts" items={view.repair_attempts.map((attempt) => `Attempt ${attempt.attempt}: ${attempt.status} - ${attempt.failure_summary}`)} />;
}

function Scope({ view }: { readonly view: RepositoryRunView }): React.ReactNode {
  return <List title="Scope Requests" items={view.scope_expansion_requests.map((request) => `${request.request_id}: ${request.reason} (${request.approval_status}) approve: ${request.suggested_approve_command}`)} />;
}

function Review({ view }: { readonly view: RepositoryRunView }): React.ReactNode {
  if (!view.review_report && !view.final_patch) return <p>Review and final patch are not available yet.</p>;
  return <div>{view.review_report ? <><h2>{view.review_report.title}</h2><p>{view.review_report.summary}</p><List title="Risk Notes" items={view.review_report.risk_notes} /><List title="Follow-ups" items={view.review_report.followups} /></> : null}{view.final_patch ? <List title="Final Patch" items={[`artifact: ${view.final_patch.artifact_id}`, `export: ${view.final_patch.export_command}`, `apply manually: ${view.final_patch.apply_command}`]} /> : null}</div>;
}

function List({ title, items }: { readonly title: string; readonly items: readonly string[] }): React.ReactNode {
  if (items.length === 0) return null;
  return <div><h2>{title}</h2><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

async function* readSseFrames(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index >= 0) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (!frame.startsWith(":")) yield frame;
      index = buffer.indexOf("\n\n");
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let timeout: number | undefined;
    const onAbort = (): void => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function responseError(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as { readonly error?: unknown }).error;
  return typeof error === "string" ? error : undefined;
}
