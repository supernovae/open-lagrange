import { describe, expect, it } from "vitest";
import { answerQuestion, composeInitialPlan, revisePlan, simulatePlan, validatePlan, withCanonicalPlanDigest, PlanRevision } from "../src/planning/index.js";

const now = "2026-05-02T12:00:00.000Z";

describe("collaborative Plan Builder", () => {
  it("creates a session for a vague research prompt", async () => {
    const session = await composeInitialPlan({
      prompt: "research open source container security",
      runtime_profile: { name: "local", searchProviders: [{ id: "local-searxng", kind: "searxng", enabled: true }] },
      now,
      persist: false,
    });

    expect(session.session_id).toMatch(/^builder_/);
    expect(session.current_intent_frame?.domain).toBe("research");
    expect(session.current_planfile?.lifecycle?.builder_session_id).toBe(session.session_id);
  });

  it("asks a blocking schedule question and applies the answer", async () => {
    const session = await composeInitialPlan({
      prompt: "Every morning, make me a cited brief on open source container security.",
      runtime_profile: { name: "local", searchProviders: [{ id: "local-searxng", kind: "searxng", enabled: true }] },
      now,
      persist: false,
    });
    const question = session.pending_questions.find((item) => item.question.includes("time of day"));

    expect(question?.severity).toBe("blocking");
    const answered = answerQuestion(session, question?.question_id ?? "missing", "08:00", { persist: false });

    expect(answered.answered_questions).toHaveLength(1);
    expect((answered.current_planfile?.execution_context?.schedule_intent as { time_of_day?: string } | undefined)?.time_of_day).toBe("08:00");
  });

  it("surfaces missing search provider in simulation", async () => {
    const session = await composeInitialPlan({ prompt: "research MCP security risks", runtime_profile: { name: "local" }, now, persist: false });

    expect(session.simulation_report?.status).toBe("needs_input");
    expect(session.simulation_report?.required_providers).toContain("search");
    expect(session.pending_questions.some((question) => question.question.includes("search source"))).toBe(true);
  });

  it("marks stable URL summary plans ready", async () => {
    const session = await composeInitialPlan({ prompt: "summarize https://example.com", now, persist: false });
    const stable = validatePlan(simulatePlan(session, { persist: false }), { persist: false });

    expect(stable.status).toBe("ready");
    expect(stable.current_planfile?.status).toBe("ready");
    expect(stable.current_planfile?.lifecycle?.validation_status).toBe("passed");
  });

  it("yields when semantic revision is required and no planner route is configured", async () => {
    const session = await composeInitialPlan({ prompt: "summarize https://example.com", now, persist: false });
    const planfile = withCanonicalPlanDigest({
      ...session.current_planfile!,
      nodes: [{ ...session.current_planfile!.nodes[0]!, depends_on: ["missing_node"] }, ...session.current_planfile!.nodes.slice(1)],
    });
    const invalid = validatePlan({ ...session, current_planfile: planfile }, { persist: false });
    const revised = await revisePlan(invalid, { persist: false });

    expect(revised.status).toBe("yielded");
    expect(revised.yield_reason).toContain("MODEL_PROVIDER_UNAVAILABLE");
  });

  it("uses injected planner revision output in tests", async () => {
    const session = await composeInitialPlan({ prompt: "summarize https://example.com", now, persist: false });
    const revised = await revisePlan(session, {
      persist: false,
      planner: async ({ planfile }) => PlanRevision.parse({
        revision_id: "revision_test",
        source: "model",
        reason: "test revision",
        changes: ["kept plan valid"],
        planfile,
        validation_ok: true,
        created_at: now,
      }),
    });

    expect(revised.revision_history.at(-1)?.source).toBe("model");
  });

  it("imports skills markdown through a Plan Builder session", async () => {
    const session = await composeInitialPlan({
      skills_markdown: "# Skill\n\nResearch a topic and write a markdown brief.",
      now,
      persist: false,
    });

    expect(session.prompt_source).toBe("skills_file");
    expect(session.current_planfile?.plan_id).toBeTruthy();
  });
});
