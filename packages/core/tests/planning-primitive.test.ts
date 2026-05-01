import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCapabilitySnapshotForTask } from "../src/capability-registry/registry.js";
import { createMockDelegationContext } from "../src/clients/mock-delegation.js";
import { createLocalPlanArtifactStore } from "../src/planning/local-plan-artifacts.js";
import { buildCapabilitySnapshot } from "../src/schemas/capabilities.js";
import { compileWorkOrder } from "../src/planning/work-order-compiler.js";
import { renderPlanMermaid } from "../src/planning/mermaid-renderer.js";
import { renderPlanfileMarkdown } from "../src/planning/planfile-markdown.js";
import { parsePlanfileMarkdown } from "../src/planning/planfile-parser.js";
import { PlanRunner } from "../src/planning/plan-runner.js";
import { inMemoryPlanStateStore } from "../src/planning/plan-state.js";
import { Planfile, type Planfile as PlanfileType } from "../src/planning/planfile-schema.js";
import { validatePlanfile, withCanonicalPlanDigest } from "../src/planning/planfile-validator.js";

const now = "2026-04-28T12:00:00.000Z";

describe("planning primitive", () => {
  it("validates a Planfile schema", () => {
    expect(Planfile.parse(planfile()).schema_version).toBe("open-lagrange.plan.v1");
  });

  it("renders Markdown with executable YAML and parses it back", () => {
    const markdown = renderPlanfileMarkdown(planfile());
    expect(markdown).toContain("```yaml planfile");
    expect(parsePlanfileMarkdown(markdown).plan_id).toBe("plan-test");
  });

  it("generates Mermaid from the DAG", () => {
    expect(renderPlanMermaid(planfile())).toContain("frame_goal -->|goal before inspect| inspect_repo");
  });

  it("rejects cycles and missing dependencies", () => {
    const cyclic = planfile({
      nodes: [
        { ...baseNode("frame_goal", "frame"), depends_on: ["inspect_repo"] },
        { ...baseNode("inspect_repo", "inspect"), depends_on: ["frame_goal"] },
      ],
    });
    expect(validatePlanfile(cyclic).issues.map((issue) => issue.code)).toContain("CYCLE_DETECTED");

    const missing = planfile({ nodes: [{ ...baseNode("inspect_repo", "inspect"), depends_on: ["missing_node"] }] });
    expect(validatePlanfile(missing).issues.map((issue) => issue.code)).toContain("MISSING_DEPENDENCY");
  });

  it("rejects write nodes without approval", () => {
    const result = validatePlanfile(planfile({
      nodes: [
        baseNode("frame_goal", "frame"),
        { ...baseNode("patch_repo", "patch"), depends_on: ["frame_goal"], risk_level: "write", approval_required: false },
      ],
    }));
    expect(result.issues.map((issue) => issue.code)).toContain("APPROVAL_REQUIRED");
  });

  it("rejects unknown capabilities when a snapshot is supplied", () => {
    const snapshot = buildCapabilitySnapshot([{
      endpoint_id: "repo",
      capability_name: "read_file",
      description: "Read file",
      input_schema: { type: "object" },
      risk_level: "read",
      requires_approval: false,
    }], now);
    const result = validatePlanfile(planfile({
      nodes: [{ ...baseNode("inspect_repo", "inspect"), allowed_capability_refs: ["repo.missing"] }],
    }), { capability_snapshot: snapshot });
    expect(result.issues.map((issue) => issue.code)).toContain("UNKNOWN_CAPABILITY");
  });

  it("compiles immediate node context into a WorkOrder", () => {
    const snapshot = buildCapabilitySnapshot([{
      endpoint_id: "repo",
      capability_name: "read_file",
      description: "Read file",
      input_schema: { type: "object" },
      risk_level: "read",
      requires_approval: false,
    }], now);
    const order = compileWorkOrder({
      plan: planfile({
        nodes: [{ ...baseNode("inspect_repo", "inspect"), allowed_capability_refs: ["repo.read_file"] }],
      }),
      node_id: "inspect_repo",
      capability_snapshot: snapshot,
    });
    expect(order.objective).toBe("Objective for inspect_repo");
    expect(order.allowed_capability_snapshot.capabilities).toHaveLength(1);
  });

  it("does not treat Markdown prose or Mermaid edits as execution truth", () => {
    const markdown = renderPlanfileMarkdown(withCanonicalPlanDigest(planfile()));
    const edited = markdown
      .replace("Goal for test", "Conflicting prose goal")
      .replace("frame_goal -->|goal before inspect| inspect_repo", "inspect_repo --> frame_goal");
    const parsed = parsePlanfileMarkdown(edited);
    expect(parsed.goal_frame.interpreted_goal).toBe("Goal for test");
    expect(validatePlanfile(parsed).ok).toBe(true);
  });

  it("executes the research URL summary Planfile through capability steps", async () => {
    const markdown = readFileSync(join(process.cwd(), "examples/planfiles/research-url-summary.plan.md"), "utf8");
    const plan = withCanonicalPlanDigest(parsePlanfileMarkdown(markdown));
    const snapshot = createCapabilitySnapshotForTask({
      allowed_capabilities: plan.nodes.flatMap((node) => node.allowed_capability_refs),
      allowed_scopes: ["research:read", "project:read"],
      max_risk_level: "read",
      now,
    });
    const artifactStore = createLocalPlanArtifactStore({ plan_id: `${plan.plan_id}_test`, output_dir: ".open-lagrange/test-plan-runner/artifacts", now });
    const runner = new PlanRunner({
      store: inMemoryPlanStateStore,
      capability_snapshot: snapshot,
      delegation_context: {
        ...createMockDelegationContext({
          goal: plan.goal_frame.interpreted_goal,
          project_id: plan.plan_id,
          workspace_id: "workspace-local",
          delegate_id: "test-plan-runner",
          allowed_scopes: ["project:read", "research:read"],
        }),
        allowed_capabilities: ["research.fetch_source", "research.extract_content", "research.export_markdown"],
        max_risk_level: "read",
      },
      runtime_config: {
        artifact_store: artifactStore,
        fetch_impl: async () => new Response("<html><title>Example Domain</title><body><p>This domain is for use in illustrative examples.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      },
      record_artifact: artifactStore.recordArtifact,
      now: () => now,
    });

    const result = await runner.runToCompletion(plan);
    const artifacts = artifactStore.flush();

    expect(result.state.status).toBe("completed");
    expect(artifacts.some((artifact) => artifact.kind === "source_snapshot" && artifact.source_mode === "live")).toBe(true);
    expect(artifacts.some((artifact) => artifact.kind === "source_text")).toBe(true);
    expect(artifacts.some((artifact) => artifact.kind === "research_brief")).toBe(true);
    expect(artifacts.find((artifact) => artifact.kind === "research_brief")?.produced_by_node_id).toBe("export_markdown");
  });
});

function planfile(patch: Partial<PlanfileType> = {}): PlanfileType {
  return Planfile.parse({
    schema_version: "open-lagrange.plan.v1",
    plan_id: "plan-test",
    goal_frame: {
      goal_id: "goal-test",
      original_prompt: "Goal for test",
      interpreted_goal: "Goal for test",
      acceptance_criteria: ["Acceptance one"],
      non_goals: ["No execution before approval"],
      assumptions: ["Fixture assumption"],
      ambiguity: { level: "low", questions: [], blocking: false },
      suggested_mode: "dry_run",
      risk_notes: [],
      created_at: now,
    },
    mode: "dry_run",
    status: "draft",
    nodes: [
      baseNode("frame_goal", "frame"),
      { ...baseNode("inspect_repo", "inspect"), depends_on: ["frame_goal"] },
    ],
    edges: [{ from: "frame_goal", to: "inspect_repo", reason: "goal before inspect" }],
    approval_policy: { require_approval_for_risks: ["write", "destructive", "external_side_effect"] },
    verification_policy: { allowed_command_ids: ["npm_run_typecheck"] },
    artifact_refs: [],
    created_at: now,
    updated_at: now,
    ...patch,
  });
}

function baseNode(id: string, kind: PlanfileType["nodes"][number]["kind"]): PlanfileType["nodes"][number] {
  return {
    id,
    kind,
    title: `Title for ${id}`,
    objective: `Objective for ${id}`,
    description: `Description for ${id}`,
    depends_on: [],
    allowed_capability_refs: [],
    expected_outputs: ["Output"],
    acceptance_refs: ["acceptance:1"],
    risk_level: "read",
    approval_required: false,
    status: "pending",
    artifacts: [],
    errors: [],
  };
}
