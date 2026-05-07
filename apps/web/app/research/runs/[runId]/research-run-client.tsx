"use client";

import { useEffect, useState } from "react";

type LiveState = "connected" | "reconnecting" | "polling fallback" | "disconnected";

interface ResearchRunView {
  readonly run_id: string;
  readonly topic: string;
  readonly provider_id?: string;
  readonly execution_mode: string;
  readonly status: string;
  readonly current_phase?: string;
  readonly source_counts: { readonly found: number; readonly selected: number; readonly rejected: number; readonly fetched: number; readonly extracted: number; readonly failed: number };
  readonly sources: readonly ResearchSource[];
  readonly brief?: { readonly title: string; readonly markdown: string; readonly artifact_id: string; readonly citation_count: number; readonly export_artifact_refs: readonly string[] };
  readonly citation_index?: { readonly citations: readonly { readonly citation_id: string; readonly source_id: string; readonly title: string; readonly url: string; readonly domain: string }[] };
  readonly artifacts: readonly { readonly artifact_id: string; readonly kind: string; readonly title: string; readonly summary: string }[];
  readonly warnings: readonly string[];
  readonly next_actions: readonly { readonly action_id: string; readonly label: string; readonly command?: string }[];
}

interface ResearchSource {
  readonly source_id: string;
  readonly title: string;
  readonly url: string;
  readonly domain: string;
  readonly selected: boolean;
  readonly rejected: boolean;
  readonly rejection_reason?: string;
  readonly selection_reason?: string;
  readonly fetched: boolean;
  readonly extracted: boolean;
  readonly citation_id?: string;
}

export default function ResearchRunClient({ runId }: { readonly runId: string }): React.ReactNode {
  const [view, setView] = useState<ResearchRunView | undefined>();
  const [liveState, setLiveState] = useState<LiveState>("disconnected");
  const [activeTab, setActiveTab] = useState<"overview" | "sources" | "brief" | "citations" | "artifacts" | "plan">("overview");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [message, setMessage] = useState("");
  const selectedSource = view?.sources.find((source) => source.source_id === selectedSourceId) ?? view?.sources[0];

  useEffect(() => {
    void refresh();
    const controller = new AbortController();
    void stream(controller.signal);
    return () => controller.abort();
  }, [runId]);

  async function refresh(): Promise<void> {
    const response = await fetch(`/api/research?run_id=${encodeURIComponent(runId)}`);
    const data = await response.json() as ResearchRunView | { readonly status?: string; readonly error?: string };
    if (!response.ok || responseError(data)) throw new Error(responseError(data) ?? "Unable to load research run.");
    setView(data as ResearchRunView);
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
    <main className="run-page">
      <header className="run-header">
        <div>
          <p className="eyebrow">Research Run</p>
          <h1>{view?.topic ?? runId}</h1>
          <p>Status: <strong>{view?.status ?? "loading"}</strong> | Live: {liveState} | Mode: {view?.execution_mode ?? "unknown"}{view?.provider_id ? ` | Provider: ${view.provider_id}` : ""}</p>
        </div>
        <a href={`/runs/${encodeURIComponent(runId)}`}>Generic Run Console</a>
      </header>
      {message ? <p className="message">{message}</p> : null}
      <nav className="tabs">
        {(["overview", "sources", "brief", "citations", "artifacts", "plan"] as const).map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab.replace("_", " ")}</button>
        ))}
      </nav>
      {view ? (
        <section className="layout">
          <aside className="panel">
            <h2>Phase</h2>
            <p>{view.current_phase ?? "waiting"}</p>
            <h2>Source Counts</h2>
            <p>{view.source_counts.found} found</p>
            <p>{view.source_counts.selected} selected</p>
            <p>{view.source_counts.rejected} rejected</p>
            <p>{view.source_counts.extracted} extracted</p>
            {view.next_actions.length > 0 ? <List title="Next Actions" items={view.next_actions.map((action) => action.command ? `${action.label}: ${action.command}` : action.label)} /> : null}
          </aside>
          <section className="panel main">
            {activeTab === "overview" ? <Overview view={view} /> : null}
            {activeTab === "sources" ? <Sources sources={view.sources} {...(selectedSource ? { selected: selectedSource } : {})} onSelect={setSelectedSourceId} /> : null}
            {activeTab === "brief" ? <Brief view={view} /> : null}
            {activeTab === "citations" ? <List title="Citations" items={(view.citation_index?.citations ?? []).map((citation) => `${citation.citation_id}: ${citation.title} (${citation.url})`)} /> : null}
            {activeTab === "artifacts" ? <List title="Artifacts" items={view.artifacts.map((artifact) => `${artifact.kind}: ${artifact.title} (${artifact.artifact_id})`)} /> : null}
            {activeTab === "plan" ? <p>Open the generic Run Console to inspect the saved Planfile projection.</p> : null}
          </section>
        </section>
      ) : <section className="panel">Loading research run...</section>}
      <style jsx>{`
        .run-page { padding: 28px; min-height: 100vh; background: #f7f8f5; color: #172026; }
        .run-header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 16px; }
        .eyebrow { text-transform: uppercase; font-size: 12px; color: #59636b; }
        h1 { margin: 0; font-size: 30px; }
        h2 { font-size: 16px; margin: 0 0 8px; }
        .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
        button { border: 1px solid #c7cec7; border-radius: 6px; background: #fff; padding: 8px 10px; cursor: pointer; text-transform: capitalize; }
        button.active { background: #1d4f4a; color: #fff; border-color: #1d4f4a; }
        .layout { display: grid; grid-template-columns: 260px 1fr; gap: 16px; }
        .panel { background: #fff; border: 1px solid #d9ded8; border-radius: 8px; padding: 16px; }
        .main { min-width: 0; }
        .source-list { display: grid; grid-template-columns: minmax(220px, 360px) 1fr; gap: 16px; }
        .source-button { display: block; width: 100%; text-align: left; margin-bottom: 6px; }
        pre { white-space: pre-wrap; background: #101817; color: #eaf2ef; padding: 14px; border-radius: 6px; overflow: auto; }
        .message { color: #8a4b0f; }
        @media (max-width: 860px) { .layout, .source-list { grid-template-columns: 1fr; } .run-page { padding: 18px; } }
      `}</style>
    </main>
  );
}

function Overview({ view }: { readonly view: ResearchRunView }): React.ReactNode {
  return (
    <div>
      <h2>Brief</h2>
      <p>{view.brief ? `${view.brief.title} (${view.brief.citation_count} citation(s))` : "Brief not available yet."}</p>
      <List title="Warnings" items={view.warnings} />
    </div>
  );
}

function Sources({ sources, selected, onSelect }: { readonly sources: readonly ResearchSource[]; readonly selected?: ResearchSource; readonly onSelect: (sourceId: string) => void }): React.ReactNode {
  return (
    <div className="source-list">
      <div>{sources.map((source) => <button className="source-button" key={source.source_id} onClick={() => onSelect(source.source_id)}>{source.selected ? "Selected" : source.rejected ? "Rejected" : "Found"}: {source.title}</button>)}</div>
      <div>{selected ? (
        <>
          <h2>{selected.title}</h2>
          <p>{selected.domain}</p>
          <p><a href={selected.url}>{selected.url}</a></p>
          <p>Fetched: {selected.fetched ? "yes" : "no"} | Extracted: {selected.extracted ? "yes" : "no"}</p>
          <p>{selected.selection_reason ?? selected.rejection_reason ?? "No selection note recorded."}</p>
        </>
      ) : "No source selected."}</div>
    </div>
  );
}

function Brief({ view }: { readonly view: ResearchRunView }): React.ReactNode {
  if (!view.brief) return <p>Brief not available yet.</p>;
  return <pre>{view.brief.markdown}</pre>;
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
    const timeout = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

function responseError(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as { readonly error?: unknown }).error;
  return typeof error === "string" ? error : undefined;
}
