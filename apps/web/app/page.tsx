"use client";

import { useState } from "react";

interface ProjectResponse {
  readonly project_id?: string;
  readonly project_run_id?: string;
  readonly hatchet_run_id?: string;
  readonly status_url?: string;
  readonly status?: { readonly status?: string; readonly final_message?: string; readonly observations?: readonly Item[]; readonly errors?: readonly Item[] };
  readonly task_statuses?: readonly TaskStatus[];
}

interface TaskStatus {
  readonly project_id: string;
  readonly task_id: string;
  readonly task_run_id: string;
  readonly status: string;
  readonly final_message?: string;
  readonly observations: readonly Item[];
  readonly errors: readonly Item[];
  readonly repository_status?: {
    readonly current_phase: string;
    readonly changed_files: readonly string[];
    readonly diff_summary?: string;
    readonly review_report?: { readonly pr_title: string; readonly pr_summary: string; readonly test_notes: readonly string[]; readonly risk_notes: readonly string[] };
  };
}

interface Item {
  readonly summary?: string;
  readonly message?: string;
  readonly code?: string;
}

export default function Page(): React.ReactNode {
  const [goal, setGoal] = useState("Create a short README summary for this repository.");
  const [repoRoot, setRepoRoot] = useState("");
  const [applyPatch, setApplyPatch] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<ProjectResponse | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const data = await response.json() as ProjectResponse;
      setStatus(data);
      setProjectId(data.project_id ?? "");
    } finally {
      setBusy(false);
    }
  }

  async function submitRepository(): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/repository/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal, repo_root: repoRoot, dry_run: !applyPatch, apply: applyPatch }),
      });
      const data = await response.json() as { readonly task_run_id?: string; readonly error?: string };
      setProjectId(data.task_run_id ?? "");
      setMessage(data.task_run_id ? `Repository task: ${data.task_run_id}` : data.error ?? "Repository task submitted");
    } finally {
      setBusy(false);
    }
  }

  async function poll(id = projectId): Promise<void> {
    if (!id) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
      setStatus(await response.json() as ProjectResponse);
    } finally {
      setBusy(false);
    }
  }

  async function decide(taskRunId: string, decision: "approve" | "reject"): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskRunId)}/${decision}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision === "approve"
          ? { approved_by: "human-local", reason: "Approved from web UI" }
          : { rejected_by: "human-local", reason: "Rejected from web UI" }),
      });
      const data = await response.json() as { readonly continuation_run_id?: string; readonly error?: string };
      setMessage(data.continuation_run_id ? `Continuation run: ${data.continuation_run_id}` : data.error ?? "Decision recorded");
      await poll();
    } finally {
      setBusy(false);
    }
  }

  const tasks = status?.task_statuses ?? [];

  return (
    <main className="shell">
      <section className="toolbar">
        <div>
          <h1>Open Lagrange</h1>
          <p>Open Lagrange is an agentic control plane for submitting goals, inspecting reconciliation status, and approving bounded task continuations.</p>
        </div>
        <button type="button" onClick={() => poll()} disabled={busy || !projectId}>Refresh</button>
      </section>

      <section className="panel">
        <label htmlFor="goal">Goal</label>
        <textarea id="goal" value={goal} onChange={(event) => setGoal(event.target.value)} rows={4} />
        <div className="actions">
          <button type="button" onClick={submit} disabled={busy || !goal.trim()}>Submit</button>
          <input value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="project ID or run ID" />
        </div>
      </section>

      <section className="panel">
        <h2>Repository Task Pack</h2>
        <input value={repoRoot} onChange={(event) => setRepoRoot(event.target.value)} placeholder="/path/to/repository" />
        <label className="check">
          <input type="checkbox" checked={applyPatch} onChange={(event) => setApplyPatch(event.target.checked)} />
          Apply after policy checks
        </label>
        <button type="button" onClick={submitRepository} disabled={busy || !goal.trim() || !repoRoot.trim()}>Run Repository Task</button>
      </section>

      {status ? (
        <section className="panel">
          <h2>Project</h2>
          <dl className="grid">
            <dt>Project ID</dt><dd>{status.project_id ?? "pending"}</dd>
            <dt>Project Run ID</dt><dd>{status.project_run_id ?? "pending"}</dd>
            <dt>Hatchet Run ID</dt><dd>{status.hatchet_run_id ?? "pending"}</dd>
            <dt>Status</dt><dd>{status.status?.status ?? "accepted"}</dd>
          </dl>
          {status.status?.final_message ? <p>{status.status.final_message}</p> : null}
        </section>
      ) : null}

      {message ? <section className="notice">{message}</section> : null}

      <section className="panel">
        <h2>Tasks</h2>
        {tasks.length === 0 ? <p>No task status records yet.</p> : null}
        {tasks.map((task) => (
          <article className="task" key={task.task_run_id}>
            <div className="taskHead">
              <strong>{task.task_id}</strong>
              <span>{task.status}</span>
            </div>
            <p>{task.final_message}</p>
            {task.repository_status ? (
              <div>
                <p>Repository phase: {task.repository_status.current_phase}</p>
                {task.repository_status.changed_files.length > 0 ? <p>Changed: {task.repository_status.changed_files.join(", ")}</p> : null}
                {task.repository_status.diff_summary ? <pre>{task.repository_status.diff_summary}</pre> : null}
                {task.repository_status.review_report ? (
                  <div>
                    <h3>{task.repository_status.review_report.pr_title}</h3>
                    <p>{task.repository_status.review_report.pr_summary}</p>
                    <ItemList title="Verification" items={task.repository_status.review_report.test_notes.map((summary) => ({ summary }))} />
                    <ItemList title="Risk" items={task.repository_status.review_report.risk_notes.map((summary) => ({ summary }))} />
                  </div>
                ) : null}
              </div>
            ) : null}
            {task.status === "requires_approval" ? (
              <div className="actions">
                <button type="button" onClick={() => decide(task.task_run_id, "approve")} disabled={busy}>Approve</button>
                <button type="button" onClick={() => decide(task.task_run_id, "reject")} disabled={busy}>Reject</button>
              </div>
            ) : null}
            <ItemList title="Observations" items={task.observations} />
            <ItemList title="Errors" items={task.errors} />
          </article>
        ))}
      </section>
    </main>
  );
}

function ItemList({ title, items }: { readonly title: string; readonly items: readonly Item[] }): React.ReactNode {
  if (items.length === 0) return null;
  return (
    <div>
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item.code ? `${item.code}: ` : ""}{item.summary ?? item.message}</li>
        ))}
      </ul>
    </div>
  );
}
