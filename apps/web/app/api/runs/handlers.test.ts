import { describe, expect, it } from "vitest";
import { createRunEvent } from "@open-lagrange/core/runs";
import { getStateStore } from "@open-lagrange/core/storage";
import { handleCreateRun, handleRetryRunNode, handleRunEvents, handleUpdateRunUiState } from "./handlers";
import { GET as streamRunEvents } from "./[runId]/events/stream/route";

const now = "2026-05-03T12:00:00.000Z";

describe("run API handlers", () => {
  it("creates a run from a Planfile and returns a run snapshot", async () => {
    const result = await handleCreateRun({ source: "planfile", live: false, planfile: planfile() });

    expect(result).toMatchObject({
      run_id: expect.stringMatching(/^plan_/),
      snapshot: {
        plan_id: "web_run_plan",
        status: "queued",
      },
    });
  });

  it("normalizes dry-run Planfiles for live run creation", async () => {
    const result = await handleCreateRun({ source: "planfile", live: true, planfile: planfile() });

    expect(result).toMatchObject({
      run_id: expect.stringMatching(/^plan_/),
      state: {
        markdown_projection: expect.stringContaining("mode: apply"),
      },
    });
    expect(JSON.stringify(result)).toContain("execution_mode: live");
  });

  it("requires an explicit replay mode for node retry", async () => {
    await expect(handleRetryRunNode("missing", "node_a", {})).rejects.toThrow();
  });

  it("persists run UI state by session key", async () => {
    const request = new Request("http://localhost/api/runs/run_ui/ui-state", { headers: { "x-open-lagrange-session": "session-test" } });
    const result = await handleUpdateRunUiState("run_ui", request, { active_tab: "timeline", selected_node_id: "node_a" });

    expect(result).toMatchObject({ run_id: "run_ui", session_key: "session-test", active_tab: "timeline", selected_node_id: "node_a" });
  });

  it("returns event stream envelopes after a cursor", async () => {
    const first = await getStateStore().appendRunEvent(createRunEvent({ run_id: "run_api_events", plan_id: "plan_api_events", type: "run.created", timestamp: now }));
    const second = await getStateStore().appendRunEvent(createRunEvent({ run_id: "run_api_events", plan_id: "plan_api_events", type: "run.started", timestamp: "2026-05-03T12:00:01.000Z" }));

    const result = await handleRunEvents("run_api_events", { after: first.event_id }) as { readonly events: readonly { readonly event_id: string; readonly sequence: number }[] };

    expect(result.events).toEqual([expect.objectContaining({ event_id: second.event_id, sequence: 2 })]);
  });

  it("streams persisted event envelopes over SSE", async () => {
    const event = await getStateStore().appendRunEvent(createRunEvent({ run_id: "run_api_stream", plan_id: "plan_api_stream", type: "run.created", timestamp: now }));
    const controller = new AbortController();
    const response = await streamRunEvents(new Request("http://localhost/api/runs/run_api_stream/events/stream", { signal: controller.signal }), { params: Promise.resolve({ runId: "run_api_stream" }) });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("missing response body");

    let text = "";
    for (let index = 0; index < 5 && !text.includes("event: run.event"); index += 1) {
      const chunk = await reader.read();
      text += new TextDecoder().decode(chunk.value);
    }
    controller.abort();
    reader.releaseLock();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: run.event");
    expect(text).toContain(`id: ${event.event_id}`);
  });
});

function planfile() {
  return {
    schema_version: "open-lagrange.plan.v1",
    plan_id: "web_run_plan",
    goal_frame: {
      goal_id: "web_run_goal",
      original_prompt: "Create a run",
      interpreted_goal: "Create a run",
      acceptance_criteria: ["Run is created."],
      non_goals: [],
      assumptions: [],
      ambiguity: { level: "low", questions: [], blocking: false },
      suggested_mode: "dry_run",
      risk_notes: [],
      created_at: now,
    },
    mode: "dry_run",
    status: "draft",
    nodes: [{
      id: "frame_goal",
      kind: "frame",
      title: "Frame goal",
      objective: "Frame goal",
      description: "Frame goal",
      depends_on: [],
      allowed_capability_refs: [],
      expected_outputs: [],
      acceptance_refs: [],
      risk_level: "read",
      approval_required: false,
      status: "pending",
      artifacts: [],
      errors: [],
    }],
    edges: [],
    approval_policy: { require_approval_for_risks: ["write", "destructive", "external_side_effect"] },
    verification_policy: { allowed_command_ids: [] },
    artifact_refs: [],
    created_at: now,
    updated_at: now,
  };
}
