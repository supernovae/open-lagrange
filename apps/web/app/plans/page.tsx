"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Library = {
  name: string;
  path: string;
  source: string;
  description?: string;
  plan_count: number;
};

type PlanEntry = {
  name: string;
  path: string;
  title?: string;
  summary?: string;
  tags?: string[];
  plan_id?: string;
  portability_level?: string;
};

type PlanCheckReport = {
  status: string;
  portability: string;
  required_packs: RequirementStatus[];
  required_providers: RequirementStatus[];
  required_credentials: RequirementStatus[];
  required_permissions: RequirementStatus[];
  approval_requirements: { approval_id: string; label: string; suggested_command?: string }[];
  warnings: string[];
  suggested_actions: { action_id: string; label: string; command?: string; required: boolean }[];
};

type RequirementStatus = {
  kind: string;
  id: string;
  label: string;
  status: string;
  suggested_command?: string;
};

export default function PlansPage() {
  const router = useRouter();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState("workspace");
  const [selectedPlan, setSelectedPlan] = useState<string | undefined>();
  const [content, setContent] = useState("");
  const [report, setReport] = useState<PlanCheckReport | undefined>();
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState<string | undefined>();

  const plan = useMemo(() => plans.find((entry) => entry.name === selectedPlan || entry.plan_id === selectedPlan), [plans, selectedPlan]);

  useEffect(() => {
    void loadLibraries();
  }, []);

  useEffect(() => {
    void loadPlan(selectedPlan);
  }, [selectedPlan, selectedLibrary]);

  async function loadLibraries() {
    setError(undefined);
    setStatus("loading");
    const response = await fetch("/api/plans", { headers: apiHeaders() });
    const payload = await response.json() as { libraries?: Library[]; plans?: PlanEntry[]; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to load plans.");
      setStatus("failed");
      return;
    }
    setLibraries(payload.libraries ?? []);
    setPlans(payload.plans ?? []);
    setSelectedPlan(payload.plans?.[0]?.name);
    setStatus("ready");
  }

  async function loadPlan(planName: string | undefined) {
    if (!planName) return;
    setReport(undefined);
    const params = new URLSearchParams({ plan: planName, library: selectedLibrary });
    const response = await fetch(`/api/plans?${params.toString()}`, { headers: apiHeaders() });
    const payload = await response.json() as { content?: string; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to load Planfile.");
      return;
    }
    setContent(payload.content ?? "");
  }

  async function checkPlan() {
    if (!content) return;
    setStatus("checking");
    const payload = await postPlanAction({ action: "check", content });
    setReport(payload as PlanCheckReport);
    setStatus("ready");
  }

  async function runPlan() {
    if (!content) return;
    setStatus("running");
    const check = await postPlanAction({ action: "check", content });
    const checkReport = check as unknown as PlanCheckReport;
    setReport(checkReport);
    if (["invalid", "unsafe", "missing_requirements"].includes(checkReport.status)) {
      setStatus("blocked");
      return;
    }
    const prepared = await postPlanAction({ action: "run", content });
    if (prepared.status === "blocked") {
      setReport(prepared.plan_check_report as PlanCheckReport);
      setStatus("blocked");
      return;
    }
    const planfile = prepared.planfile;
    const run = await fetch("/api/runs", {
      method: "POST",
      headers: { ...apiHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ source: "planfile", planfile, live: true }),
    });
    const payload = await run.json() as Record<string, unknown>;
    if (!run.ok) {
      setError(String(payload.error ?? "Run creation failed."));
      setStatus("failed");
      return;
    }
    if (payload.status === "blocked") {
      setReport(payload.plan_check_report as PlanCheckReport);
      setStatus("blocked");
      return;
    }
    const runId = payload.run_id as string | undefined;
    if (runId) router.push(`/runs/${runId}`);
  }

  async function schedulePlan() {
    if (!content) return;
    const payload = await postPlanAction({ action: "schedule", content, cadence: "daily" });
    if (payload.status === "blocked") setReport(payload.plan_check_report as PlanCheckReport);
    else setStatus("scheduled");
  }

  async function savePlan() {
    if (!content || !plan) return;
    const path = plan.path.split("/").slice(-2).join("/") || `${plan.name}.plan.md`;
    await postPlanAction({ action: "save", content, library: selectedLibrary, path });
    setStatus("saved");
  }

  async function postPlanAction(body: Record<string, unknown>) {
    setError(undefined);
    const response = await fetch("/api/plans", {
      method: "POST",
      headers: { ...apiHeaders(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      setError(String(payload.error ?? "Plan action failed."));
      setStatus("failed");
      return payload;
    }
    return payload;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto grid max-w-7xl grid-cols-[280px_1fr_360px] gap-0">
        <aside className="min-h-screen border-r border-zinc-800 p-5">
          <div className="mb-5 flex items-center justify-between">
            <h1 className="text-lg font-semibold">Plan Library</h1>
            <button className="rounded border border-zinc-700 px-2 py-1 text-xs" onClick={() => void loadLibraries()}>Refresh</button>
          </div>
          <select className="mb-4 w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-sm" value={selectedLibrary} onChange={(event) => setSelectedLibrary(event.target.value)}>
            {libraries.map((library) => <option key={library.name} value={library.name}>{library.name} ({library.plan_count})</option>)}
          </select>
          <div className="space-y-2">
            {plans.map((entry) => (
              <button
                key={`${entry.path}:${entry.name}`}
                className={`w-full rounded border p-3 text-left text-sm ${selectedPlan === entry.name ? "border-cyan-500 bg-cyan-950/40" : "border-zinc-800 bg-zinc-900"}`}
                onClick={() => setSelectedPlan(entry.name)}
              >
                <span className="block font-medium">{entry.title ?? entry.name}</span>
                <span className="mt-1 block text-xs text-zinc-400">{entry.summary ?? entry.path}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="min-h-screen p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{plan?.title ?? selectedPlan ?? "Planfile"}</h2>
              <p className="text-sm text-zinc-400">{plan?.path}</p>
            </div>
            <div className="flex gap-2">
              <button className="rounded bg-zinc-800 px-3 py-2 text-sm" onClick={() => void checkPlan()}>Check</button>
              <button className="rounded bg-cyan-600 px-3 py-2 text-sm font-medium text-white" onClick={() => void runPlan()}>Run Now</button>
              <button className="rounded bg-zinc-800 px-3 py-2 text-sm" onClick={() => void schedulePlan()}>Schedule</button>
              <button className="rounded bg-zinc-800 px-3 py-2 text-sm" onClick={() => void savePlan()}>Save</button>
            </div>
          </div>
          {error ? <div className="mb-3 rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-100">{error}</div> : null}
          <textarea
            className="h-[calc(100vh-130px)] w-full resize-none rounded border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm leading-6 text-zinc-100"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            spellCheck={false}
          />
        </section>
        <aside className="min-h-screen border-l border-zinc-800 p-5">
          <div className="mb-4 rounded border border-zinc-800 bg-zinc-900 p-3 text-sm">
            <div className="text-xs uppercase text-zinc-500">Status</div>
            <div className="mt-1 font-medium">{status}</div>
          </div>
          {report ? <PlanCheckPanel report={report} /> : <div className="text-sm text-zinc-500">Run Plan Check to see requirements.</div>}
        </aside>
      </div>
    </main>
  );
}

function PlanCheckPanel({ report }: { readonly report: PlanCheckReport }) {
  const requirements = [...report.required_packs, ...report.required_providers, ...report.required_credentials, ...report.required_permissions];
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded border border-zinc-800 bg-zinc-900 p-3">
        <div className="text-xs uppercase text-zinc-500">Plan Check</div>
        <div className="mt-1 font-medium">{report.status}</div>
        <div className="text-xs text-zinc-400">{report.portability}</div>
      </div>
      <div>
        <h3 className="mb-2 font-medium">Requirements</h3>
        <div className="space-y-2">
          {requirements.map((item) => (
            <div key={`${item.kind}:${item.id}`} className="rounded border border-zinc-800 bg-zinc-900 p-2">
              <div className="flex justify-between gap-2">
                <span>{item.label}</span>
                <span className={item.status === "present" ? "text-emerald-300" : "text-amber-300"}>{item.status}</span>
              </div>
              {item.suggested_command ? <code className="mt-1 block text-xs text-zinc-400">{item.suggested_command}</code> : null}
            </div>
          ))}
        </div>
      </div>
      {report.approval_requirements.length > 0 ? <div>
        <h3 className="mb-2 font-medium">Approvals</h3>
        {report.approval_requirements.map((approval) => <div key={approval.approval_id} className="mb-2 rounded border border-zinc-800 bg-zinc-900 p-2">{approval.label}</div>)}
      </div> : null}
      {report.suggested_actions.length > 0 ? <div>
        <h3 className="mb-2 font-medium">Next Actions</h3>
        {report.suggested_actions.map((action) => <div key={action.action_id} className="mb-2 rounded border border-zinc-800 bg-zinc-900 p-2">{action.label}{action.command ? <code className="mt-1 block text-xs text-zinc-400">{action.command}</code> : null}</div>)}
      </div> : null}
      {report.warnings.length > 0 ? <div>
        <h3 className="mb-2 font-medium">Warnings</h3>
        {report.warnings.map((warning) => <div key={warning} className="mb-2 rounded border border-amber-900 bg-amber-950/30 p-2 text-amber-100">{warning}</div>)}
      </div> : null}
    </div>
  );
}

function apiHeaders(): Record<string, string> {
  return {};
}
