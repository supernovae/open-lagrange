import { listArtifacts, listRuns, recentArtifacts } from "@open-lagrange/core/artifacts";
import { getCapabilitiesSummary } from "@open-lagrange/core/chat-pack";
import { listPlanBuilderSessions, listScheduleRecords } from "@open-lagrange/core/planning";
import { getCurrentProfile, getRuntimeStatus } from "@open-lagrange/runtime-manager";

export async function handleWorkbenchOverview(): Promise<unknown> {
  const [runtime, providers] = await Promise.all([safeRuntimeStatus(), handleWorkbenchProviders()]);
  const sessions = recentSessions();
  const runs = recentRuns();
  const artifacts = recentArtifacts({ limit: 10 });
  const schedules = listScheduleRecords().slice(-10).reverse();
  const approvals = approvalItems();
  const capabilities = getCapabilitiesSummary({ artifact_limit: 6 });
  return {
    runtime,
    providers,
    sessions,
    runs,
    artifacts,
    schedules,
    approvals,
    packs: capabilities.packs,
    summary: {
      plans: sessions.length,
      runs: runs.length,
      artifacts: artifacts.length,
      approvals: approvals.length,
      schedules: schedules.length,
      packs: capabilities.packs.length,
    },
  };
}

export function handleWorkbenchRuns(): unknown {
  return { runs: recentRuns(30) };
}

export function handleWorkbenchArtifacts(): unknown {
  return { artifacts: recentArtifacts({ limit: 50, include_debug: true }) };
}

export function handleWorkbenchSchedules(): unknown {
  return { schedules: listScheduleRecords().slice().reverse() };
}

export function handleWorkbenchApprovals(): unknown {
  return { approvals: approvalItems() };
}

export async function handleWorkbenchProviders(): Promise<unknown> {
  const profile = await getCurrentProfile().catch(() => undefined);
  return {
    profile: profile?.name ?? "unknown",
    active_model_provider: profile?.activeModelProvider ?? "not_configured",
    model_providers: Object.entries(profile?.modelProviders ?? {}).map(([id, provider]) => ({
      id,
      provider: provider && typeof provider === "object" && "provider" in provider ? String((provider as { readonly provider?: unknown }).provider) : id,
      configured: Boolean(provider),
    })),
    search_providers: (profile?.searchProviders ?? []).map((provider) => ({
      id: provider.id,
      kind: provider.kind,
      enabled: provider.enabled !== false,
    })),
    secret_refs: Object.keys(profile?.secretRefs ?? {}),
  };
}

async function safeRuntimeStatus(): Promise<unknown> {
  try {
    return await getRuntimeStatus();
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function recentSessions(limit = 12) {
  return listPlanBuilderSessions()
    .slice()
    .reverse()
    .slice(0, limit)
    .map((session) => ({
      session_id: session.session_id,
      status: session.status,
      prompt_source: session.prompt_source,
      plan_id: session.current_planfile?.plan_id,
      goal: session.current_intent_frame?.interpreted_goal ?? session.original_input,
      pending_questions: session.pending_questions.length,
      updated_at: session.updated_at,
    }));
}

function recentRuns(limit = 12) {
  return listRuns().slice().reverse().slice(0, limit);
}

function approvalItems() {
  const approvalArtifacts = listArtifacts()
    .filter((artifact) => artifact.kind === "approval_request")
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .map((artifact) => ({
      id: artifact.artifact_id,
      kind: "artifact",
      title: artifact.title,
      summary: artifact.summary,
      related_plan_id: artifact.related_plan_id ?? artifact.produced_by_plan_id,
      created_at: artifact.created_at,
      status: artifact.validation_status ?? "requested",
    }));
  const sessionApprovals = listPlanBuilderSessions()
    .filter((session) => (session.simulation_report?.approval_requirements.length ?? 0) > 0)
    .map((session) => ({
      id: session.session_id,
      kind: "plan_builder",
      title: `Plan Builder approval review: ${session.current_planfile?.plan_id ?? session.session_id}`,
      summary: session.simulation_report?.approval_requirements.join(", ") ?? "Approval required.",
      related_plan_id: session.current_planfile?.plan_id,
      created_at: session.updated_at,
      status: session.status,
    }));
  return [...approvalArtifacts, ...sessionApprovals].sort((left, right) => right.created_at.localeCompare(left.created_at));
}
