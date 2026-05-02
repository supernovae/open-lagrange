"use client";

import { useMemo, useState } from "react";

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
  readonly current_intent_frame?: { readonly domain?: string; readonly action?: string; readonly interpreted_goal?: string; readonly output_expectation?: { readonly kind?: string }; readonly schedule_intent?: { readonly requested?: boolean; readonly cadence?: string; readonly time_of_day?: string } };
  readonly current_planfile?: { readonly plan_id?: string; readonly status?: string; readonly nodes?: readonly { readonly id: string; readonly title: string }[] };
  readonly simulation_report?: { readonly status?: string; readonly required_packs?: readonly string[]; readonly required_providers?: readonly string[]; readonly approval_requirements?: readonly string[]; readonly warnings?: readonly string[]; readonly predicted_artifacts?: readonly string[] };
  readonly validation_report?: { readonly ok?: boolean; readonly issues?: readonly { readonly code?: string; readonly message?: string; readonly severity?: string }[] };
  readonly pending_questions: readonly BuilderQuestion[];
}

export default function Page(): React.ReactNode {
  const [prompt, setPrompt] = useState("Every morning, make me a cited brief on open source container security.");
  const [skillsMarkdown, setSkillsMarkdown] = useState("");
  const [session, setSession] = useState<BuilderSession | undefined>();
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [modelRoute, setModelRoute] = useState("");
  const [outputPath, setOutputPath] = useState(".open-lagrange/plans/plan-builder-output.plan.md");
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [apiToken, setApiToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => session?.pending_questions.find((question) => question.question_id === selectedQuestion) ?? session?.pending_questions[0], [selectedQuestion, session]);
  const mermaid = useMemo(() => mermaidSource(session), [session]);

  async function compose(): Promise<void> {
    await call("/api/plan-builder/sessions", { prompt, ...(skillsMarkdown.trim() ? { skills_markdown: skillsMarkdown } : {}) }, setSession);
  }

  async function refresh(): Promise<void> {
    if (!session) return;
    await fetchSession(session.session_id);
  }

  async function answerQuestion(): Promise<void> {
    if (!session || !selected) return;
    await call(`/api/plan-builder/sessions/${session.session_id}/answer`, { question_id: selected.question_id, answer: answer || selected.default_assumption || selected.choices[0] || "accepted" }, setSession);
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
      if (isBuilderSession(data)) setSession(data);
      setMessage(JSON.stringify(data, null, 2));
    });
  }

  async function call<T>(url: string, body: unknown, onData: (data: T) => void): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: apiHeaders(apiToken), body: JSON.stringify(body) });
      const data = await response.json() as T;
      onData(data);
      if (!response.ok) setMessage(JSON.stringify(data, null, 2));
    } finally {
      setBusy(false);
    }
  }

  async function fetchSession(sessionId: string): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(`/api/plan-builder/sessions/${sessionId}`, { headers: apiHeaders(apiToken) });
      setSession(await response.json() as BuilderSession);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell wide">
      <section className="toolbar">
        <div>
          <h1>Plan Builder</h1>
          <p>Collaboratively turn prompts and skills files into validated, editable Planfiles.</p>
        </div>
        <button type="button" onClick={refresh} disabled={busy || !session}>Refresh</button>
      </section>

      <section className="builderGrid">
        <div className="panel builderPrimary">
          <h2>Prompt / Source</h2>
          <label htmlFor="prompt">Prompt</label>
          <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} />
          <label htmlFor="skills">skills.md import</label>
          <textarea id="skills" value={skillsMarkdown} onChange={(event) => setSkillsMarkdown(event.target.value)} rows={5} placeholder="Optional skills.md content" />
          <input value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="API bearer token" />
          <input value={modelRoute} onChange={(event) => setModelRoute(event.target.value)} placeholder="planner route for revision, optional" />
          <div className="actions">
            <button type="button" onClick={compose} disabled={busy || !prompt.trim()}>Compose</button>
            <button type="button" onClick={() => sessionAction("revise")} disabled={busy || !session}>Revise</button>
            <button type="button" onClick={() => sessionAction("validate")} disabled={busy || !session}>Validate</button>
            <button type="button" onClick={() => sessionAction("accept-defaults")} disabled={busy || !session}>Accept Defaults</button>
          </div>
        </div>

        <div className="panel">
          <h2>IntentFrame</h2>
          <dl className="grid">
            <dt>Session</dt><dd>{session?.session_id ?? "none"}</dd>
            <dt>Status</dt><dd>{session?.status ?? "idle"}</dd>
            <dt>Domain</dt><dd>{session?.current_intent_frame?.domain ?? "unknown"}</dd>
            <dt>Action</dt><dd>{session?.current_intent_frame?.action ?? "unknown"}</dd>
            <dt>Output</dt><dd>{session?.current_intent_frame?.output_expectation?.kind ?? "unknown"}</dd>
            <dt>Schedule</dt><dd>{session?.current_intent_frame?.schedule_intent?.requested ? `${session.current_intent_frame.schedule_intent.cadence ?? "requested"} ${session.current_intent_frame.schedule_intent.time_of_day ?? ""}` : "none"}</dd>
          </dl>
          <p>{session?.current_intent_frame?.interpreted_goal}</p>
          {session?.yield_reason ? <p className="warning">{session.yield_reason}</p> : null}
        </div>

        <div className="panel">
          <h2>Pending Questions</h2>
          {session?.pending_questions.length ? session.pending_questions.map((question) => (
            <button className="questionButton" type="button" key={question.question_id} onClick={() => setSelectedQuestion(question.question_id)}>
              {question.severity}: {question.question}
            </button>
          )) : <p>No pending questions.</p>}
          {selected ? (
            <div className="questionDetail">
              <h3>{selected.question}</h3>
              <p>{selected.why_it_matters}</p>
              <p>Default: {selected.default_assumption ?? "none"}</p>
              <input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={selected.choices.join(" / ")} />
              <button type="button" onClick={answerQuestion} disabled={busy}>Answer</button>
            </div>
          ) : null}
        </div>

        <div className="panel">
          <h2>Simulation / Requirements</h2>
          <dl className="grid">
            <dt>Status</dt><dd>{session?.simulation_report?.status ?? "none"}</dd>
            <dt>Packs</dt><dd>{list(session?.simulation_report?.required_packs)}</dd>
            <dt>Providers</dt><dd>{list(session?.simulation_report?.required_providers)}</dd>
            <dt>Approvals</dt><dd>{list(session?.simulation_report?.approval_requirements)}</dd>
            <dt>Artifacts</dt><dd>{list(session?.simulation_report?.predicted_artifacts)}</dd>
          </dl>
          <List title="Warnings" items={session?.simulation_report?.warnings ?? []} />
        </div>

        <div className="panel">
          <h2>Validation</h2>
          <p>{session?.validation_report?.ok === true ? "Passed" : session?.validation_report?.ok === false ? "Failed" : "Not run"}</p>
          <List title="Issues" items={(session?.validation_report?.issues ?? []).map((issue) => `${issue.severity ?? "issue"} ${issue.code ?? ""}: ${issue.message ?? ""}`)} />
        </div>

        <div className="panel builderPrimary">
          <h2>Planfile</h2>
          <textarea value={JSON.stringify(session?.current_planfile ?? {}, null, 2)} readOnly rows={18} />
          <div className="actions">
            <input value={outputPath} onChange={(event) => setOutputPath(event.target.value)} />
            <button type="button" onClick={() => sessionAction("save")} disabled={busy || !session}>Save</button>
            <button type="button" onClick={() => sessionAction("run")} disabled={busy || !session}>Run Now</button>
          </div>
        </div>

        <div className="panel builderPrimary">
          <h2>DAG</h2>
          <pre>{mermaid}</pre>
          <p>Graph rendering can be added later; this panel shows Mermaid source now.</p>
          <div className="actions">
            <input value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} />
            <button type="button" onClick={() => sessionAction("schedule")} disabled={busy || !session}>Schedule Daily</button>
          </div>
        </div>
      </section>

      {message ? <section className="notice"><pre>{message}</pre></section> : null}
    </main>
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

function List({ title, items }: { readonly title: string; readonly items: readonly string[] }): React.ReactNode {
  if (items.length === 0) return null;
  return (
    <div>
      <h3>{title}</h3>
      <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul>
    </div>
  );
}

function mermaidSource(session: BuilderSession | undefined): string {
  const nodes = session?.current_planfile?.nodes ?? [];
  if (nodes.length === 0) return "flowchart TD\n  empty[No Planfile yet]";
  return ["flowchart TD", ...nodes.map((node) => `  ${node.id}[${node.title.replace(/[\[\]]/g, "")}]`)].join("\n");
}
