"use client";

import { useState } from "react";

type PlanCheckStatus = "runnable" | "runnable_with_warnings" | "missing_requirements" | "invalid" | "unsafe";

interface PlanResult {
  readonly markdown: string;
  readonly planfile: { readonly plan_id: string };
  readonly plan_check_report: {
    readonly status: PlanCheckStatus;
    readonly warnings: readonly string[];
    readonly required_providers: readonly Requirement[];
    readonly required_credentials: readonly Requirement[];
    readonly suggested_actions: readonly { readonly action_id: string; readonly label: string; readonly command?: string }[];
  };
}

interface Requirement {
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly suggested_command?: string;
}

interface RunResult {
  readonly status: "blocked" | "created";
  readonly run_id?: string;
  readonly message: string;
  readonly plan_check_report: PlanResult["plan_check_report"];
}

export default function ResearchWorkbenchPage(): React.ReactNode {
  const [topic, setTopic] = useState("open source container security");
  const [providerId, setProviderId] = useState("local-searxng");
  const [maxSources, setMaxSources] = useState(5);
  const [briefStyle, setBriefStyle] = useState("standard");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [plan, setPlan] = useState<PlanResult | undefined>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(action: "plan" | "run" | "save" | "schedule"): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({
          action,
          topic,
          provider_id: providerId || undefined,
          urls: url ? [url] : [],
          max_sources: maxSources,
          brief_style: briefStyle,
          ...(plan?.markdown ? { markdown: plan.markdown } : {}),
          ...(action === "save" ? { library: "workspace", path: `research/${slug(topic)}.plan.md` } : {}),
          ...(action === "schedule" ? { cadence: "daily", time_of_day: "08:00" } : {}),
        }),
      });
      const data = await response.json() as PlanResult | RunResult | { readonly error?: string; readonly message?: string };
      if (!response.ok) throw new Error(responseMessage(data) ?? `Request failed: ${response.status}`);
      if (action === "run") {
        const run = data as RunResult;
        if (run.status === "created" && run.run_id) {
          window.location.href = `/research/runs/${encodeURIComponent(run.run_id)}`;
          return;
        }
        setMessage(run.message);
        setPlan((current) => current ? { ...current, plan_check_report: run.plan_check_report } : current);
        return;
      }
      if (action === "plan") setPlan(data as PlanResult);
      setMessage(action === "save" ? "Planfile saved to the workspace library." : action === "schedule" ? "Schedule record created." : "Planfile generated and checked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const blocking = plan?.plan_check_report.status === "missing_requirements" || plan?.plan_check_report.status === "invalid" || plan?.plan_check_report.status === "unsafe";

  return (
    <main className="research-page">
      <section className="research-header">
        <div>
          <p className="eyebrow">Research Workbench</p>
          <h1>Planfile-driven cited research</h1>
          <p>Compose a research Planfile, check requirements, run it, then inspect sources, citations, artifacts, and the brief.</p>
        </div>
        <a href="/plans">Plan Library</a>
      </section>

      <section className="research-grid">
        <form className="panel" onSubmit={(event) => { event.preventDefault(); void submit("plan"); }}>
          <label>
            Topic
            <textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={4} />
          </label>
          <label>
            Source URL
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Optional explicit source URL" />
          </label>
          <div className="row">
            <label>
              Provider
              <input value={providerId} onChange={(event) => setProviderId(event.target.value)} />
            </label>
            <label>
              Max sources
              <input type="number" min={1} max={25} value={maxSources} onChange={(event) => setMaxSources(Number(event.target.value))} />
            </label>
          </div>
          <label>
            Brief style
            <select value={briefStyle} onChange={(event) => setBriefStyle(event.target.value)}>
              <option value="concise">Concise</option>
              <option value="standard">Standard</option>
              <option value="technical">Technical</option>
              <option value="executive">Executive</option>
            </select>
          </label>
          <label>
            API token
            <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Only needed when auth is enabled" />
          </label>
          <div className="actions">
            <button type="submit" disabled={busy}>Check</button>
            <button type="button" disabled={busy} onClick={() => void submit("run")}>Run Now</button>
            <button type="button" disabled={busy || !plan} onClick={() => void submit("save")}>Save</button>
            <button type="button" disabled={busy || !plan} onClick={() => void submit("schedule")}>Schedule</button>
          </div>
          {message ? <p className={blocking ? "message warning" : "message"}>{message}</p> : null}
        </form>

        <section className="panel">
          <h2>Plan Check</h2>
          {plan ? (
            <>
              <p>Status: <strong>{plan.plan_check_report.status}</strong></p>
              <RequirementList title="Providers" items={plan.plan_check_report.required_providers} />
              <RequirementList title="Credentials" items={plan.plan_check_report.required_credentials} />
              {plan.plan_check_report.warnings.length > 0 ? <List title="Warnings" items={plan.plan_check_report.warnings} /> : null}
              {plan.plan_check_report.suggested_actions.length > 0 ? <List title="Suggested Actions" items={plan.plan_check_report.suggested_actions.map((action) => action.command ? `${action.label}: ${action.command}` : action.label)} /> : null}
            </>
          ) : <p>Generate a Planfile to see runnable status, requirements, warnings, and remediation.</p>}
        </section>
      </section>

      <section className="panel">
        <h2>Generated Planfile</h2>
        <pre>{plan?.markdown ?? "No Planfile generated yet."}</pre>
      </section>

      <style jsx>{`
        .research-page { padding: 32px; color: #172026; background: #f7f8f5; min-height: 100vh; }
        .research-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 24px; }
        .eyebrow { text-transform: uppercase; font-size: 12px; letter-spacing: .08em; color: #59636b; }
        h1 { margin: 0; font-size: 32px; }
        h2 { margin: 0 0 12px; font-size: 18px; }
        .research-grid { display: grid; grid-template-columns: minmax(320px, 480px) 1fr; gap: 16px; align-items: start; }
        .panel { background: #fff; border: 1px solid #d9ded8; border-radius: 8px; padding: 16px; }
        label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
        textarea, input, select { border: 1px solid #c7cec7; border-radius: 6px; padding: 9px; font: inherit; background: #fff; }
        .row { display: grid; grid-template-columns: 1fr 120px; gap: 12px; }
        .actions { display: flex; gap: 8px; flex-wrap: wrap; }
        button { border: 1px solid #1d4f4a; border-radius: 6px; background: #1d4f4a; color: white; padding: 9px 12px; font: inherit; cursor: pointer; }
        button:disabled { opacity: .55; cursor: default; }
        .message { color: #28524d; }
        .warning { color: #8a4b0f; }
        pre { white-space: pre-wrap; overflow: auto; max-height: 520px; background: #101817; color: #eaf2ef; padding: 14px; border-radius: 6px; }
        @media (max-width: 820px) { .research-grid { grid-template-columns: 1fr; } .research-page { padding: 18px; } }
      `}</style>
    </main>
  );
}

function RequirementList({ title, items }: { readonly title: string; readonly items: readonly Requirement[] }): React.ReactNode {
  if (items.length === 0) return null;
  return <List title={title} items={items.map((item) => `${item.label}: ${item.status}${item.suggested_command ? ` (${item.suggested_command})` : ""}`)} />;
}

function List({ title, items }: { readonly title: string; readonly items: readonly string[] }): React.ReactNode {
  return (
    <div>
      <h3>{title}</h3>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

function authHeaders(token: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

function responseMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { readonly message?: unknown; readonly error?: unknown };
  return typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : undefined;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "research";
}
