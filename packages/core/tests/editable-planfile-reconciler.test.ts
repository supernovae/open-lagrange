import { describe, expect, it } from "vitest";
import { composeInitialPlan, diffPlanfileMarkdown, getPlanBuilderSession, parsePlanfileMarkdown, reconcilePlanfileMarkdown, renderPlanfileMarkdown, savePlanBuilderSession, updateBuilderPlanfileFromMarkdown, withCanonicalPlanDigest, canonicalPlanSha256 } from "../src/planning/index.js";

const now = "2026-05-02T12:00:00.000Z";

describe("editable Planfile reconciliation", () => {
  it("fails when no executable block exists", () => {
    expect(() => parsePlanfileMarkdown("# Notes only")).toThrow("No executable Planfile YAML block found.");
  });

  it("fails when multiple executable blocks exist", async () => {
    const session = await composeInitialPlan({ prompt: "summarize https://example.com", now, persist: false });
    const markdown = renderPlanfileMarkdown(session.current_planfile!);
    expect(() => parsePlanfileMarkdown(`${markdown}\n\n${markdown}`)).toThrow("Multiple executable Planfile YAML blocks found.");
  });

  it("ignores freeform Markdown and Mermaid changes for canonical digest", async () => {
    const session = await composeInitialPlan({ prompt: "summarize https://example.com", now, persist: false });
    const markdown = renderPlanfileMarkdown(session.current_planfile!);
    const edited = markdown.replace("# Planfile:", "# Edited collaborative notes\n\n# Planfile:").replace(/```mermaid[\s\S]*?```/, "```mermaid\ngraph TD\n  fake[Ignored]\n```");

    expect(canonicalPlanSha256(parsePlanfileMarkdown(edited))).toBe(canonicalPlanSha256(parsePlanfileMarkdown(markdown)));
    expect(reconcilePlanfileMarkdown({ markdown: edited }).mermaid).not.toContain("fake[Ignored]");
  });

  it("changes digest when executable YAML changes", async () => {
    const session = await composeInitialPlan({ prompt: "summarize https://example.com", now, persist: false });
    const plan = session.current_planfile!;
    const edited = renderPlanfileMarkdown(withCanonicalPlanDigest({ ...plan, nodes: [{ ...plan.nodes[0]!, title: "Edited title" }, ...plan.nodes.slice(1)] }));

    expect(canonicalPlanSha256(parsePlanfileMarkdown(edited))).not.toBe(canonicalPlanSha256(plan));
  });

  it("reports node, capability, risk, and schedule changes in structured diff", async () => {
    const session = await composeInitialPlan({ prompt: "summarize https://example.com", now, persist: false });
    const plan = session.current_planfile!;
    const next = withCanonicalPlanDigest({
      ...plan,
      nodes: [
        ...plan.nodes,
        {
          ...plan.nodes.at(-1)!,
          id: "extra_review",
          title: "Extra review",
          depends_on: [plan.nodes.at(-1)!.id],
          allowed_capability_refs: ["repo.get_diff"],
          risk_level: "write",
          approval_required: true,
        },
      ],
      edges: [...plan.edges, { from: plan.nodes.at(-1)!.id, to: "extra_review", reason: "review edit" }],
      execution_context: { ...(plan.execution_context ?? {}), schedule_intent: { requested: true, cadence: "daily" } },
    });
    const result = diffPlanfileMarkdown(renderPlanfileMarkdown(plan), renderPlanfileMarkdown(next));

    expect(result.diff.nodes_added.map((node) => node.id)).toContain("extra_review");
    expect(result.diff.capabilities_added).toContain("repo.get_diff");
    expect(result.diff.risk_changes.some((change) => change.target === "extra_review" && change.increased)).toBe(true);
    expect(result.diff.schedule_changed).toBeTruthy();
  });

  it("updates a session for a safe executable edit", async () => {
    const session = savePlanBuilderSession(await composeInitialPlan({ prompt: "summarize https://example.com safe edit", now, persist: false }));
    const plan = session.current_planfile!;
    const markdown = renderPlanfileMarkdown(withCanonicalPlanDigest({ ...plan, nodes: [{ ...plan.nodes[0]!, title: "Edited frame" }, ...plan.nodes.slice(1)] }));
    const report = await updateBuilderPlanfileFromMarkdown({ session_id: session.session_id, markdown, update_source: "cli" });

    expect(report.parse_status).toBe("passed");
    expect(report.validation_status).toBe("passed");
    expect(report.builder_status).toBe("ready");
    expect(report.artifact_refs).toContainEqual(expect.stringMatching(/^planfile_update_report_/));
  });

  it("does not replace current executable plan when validation fails", async () => {
    const session = savePlanBuilderSession(await composeInitialPlan({ prompt: "summarize https://example.com invalid edit", now, persist: false }));
    const beforeDigest = session.current_planfile!.canonical_plan_digest;
    const invalid = withCanonicalPlanDigest({
      ...session.current_planfile!,
      nodes: [{ ...session.current_planfile!.nodes[0]!, depends_on: ["missing_node"] }, ...session.current_planfile!.nodes.slice(1)],
    });
    const report = await updateBuilderPlanfileFromMarkdown({ session_id: session.session_id, markdown: renderPlanfileMarkdown(invalid), update_source: "cli" });

    expect(report.validation_status).toBe("failed");
    expect(getPlanBuilderSession(session.session_id)?.current_planfile?.canonical_plan_digest).toBe(beforeDigest);
  });

  it("marks missing provider edits as needs_input", async () => {
    const session = savePlanBuilderSession(await composeInitialPlan({ prompt: "research editable plan provider gap", now, persist: false }));
    const report = await updateBuilderPlanfileFromMarkdown({ session_id: session.session_id, markdown: renderPlanfileMarkdown(session.current_planfile!), update_source: "cli" });

    expect(report.validation_status).toBe("passed");
    expect(report.builder_status).toBe("needs_input");
    expect(report.questions.some((question) => question.question.includes("search source"))).toBe(true);
  });
});
