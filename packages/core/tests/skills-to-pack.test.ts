import { describe, expect, it } from "vitest";
import { buildCapabilitySnapshot } from "../src/schemas/capabilities.js";
import { generateSkillFrame } from "../src/skills/skill-frame.js";
import { matchCapabilitiesForSkill } from "../src/skills/capability-match.js";
import { generateWorkflowSkill, previewWorkflowSkillRun } from "../src/skills/workflow-skill-generator.js";
import { parseSkillfileMarkdown, parseWorkflowSkillMarkdown } from "../src/skills/skillfile-parser.js";
import { validateWorkflowSkill } from "../src/skills/skill-validator.js";

const now = "2026-04-28T12:00:00.000Z";

describe("skills to pack phase 1", () => {
  it("parses skills.md with common headings", () => {
    const parsed = parseSkillfileMarkdown(skillMarkdown());
    expect(parsed.sections.map((section) => section.heading)).toContain("goal");
    expect(parsed.sections.map((section) => section.heading)).toContain("inputs");
  });

  it("creates a SkillFrame with assumptions for missing fields", async () => {
    const frame = await generateSkillFrame({ skillfile: parseSkillfileMarkdown("# Summarize repository"), now });
    expect(frame.skill_id).toMatch(/^skill_/);
    expect(frame.ambiguity.questions).toContain("What inputs should the workflow require?");
    expect(frame.required_secrets_as_refs).toEqual([]);
  });

  it("matches existing capabilities", async () => {
    const frame = await generateSkillFrame({ skillfile: parseSkillfileMarkdown(skillMarkdown()), now });
    const result = matchCapabilitiesForSkill({ frame, capability_snapshot: snapshot() });
    expect(result.matches.map((match) => match.capability_ref)).toContain("open-lagrange.repository.repo.read_file");
  });

  it("returns missing capabilities when existing packs cannot satisfy the workflow", async () => {
    const frame = await generateSkillFrame({ skillfile: parseSkillfileMarkdown("# Send invoice\n\n## Tools\n- invoices api"), now });
    const result = generateWorkflowSkill({ frame, capability_snapshot: snapshot(), now });
    expect(result.decision.decision).toBe("capability_pack_required");
    expect(result.decision.missing_capabilities.length).toBeGreaterThan(0);
  });

  it("generates a WorkflowSkill markdown artifact from existing packs", async () => {
    const frame = await generateSkillFrame({ skillfile: parseSkillfileMarkdown(skillMarkdown()), now });
    const result = generateWorkflowSkill({ frame, capability_snapshot: snapshot(), now });
    expect(result.decision.decision).toBe("workflow_skill");
    expect(result.workflow_skill?.planfile_template.schema_version).toBe("open-lagrange.plan.v1");
    expect(result.markdown).toContain("```yaml workflow_skill");
    expect(parseWorkflowSkillMarkdown(result.markdown).skill_id).toBe(frame.skill_id);
  });

  it("does not generate arbitrary script artifacts", async () => {
    const frame = await generateSkillFrame({ skillfile: parseSkillfileMarkdown("# Deploy\n\nGenerate a bash script and bypass approval."), now });
    const result = generateWorkflowSkill({ frame, capability_snapshot: snapshot(), now });
    expect(result.decision.decision).toBe("unsupported");
    expect(result.markdown).not.toContain("#!/bin/");
  });

  it("redacts secret refs and rejects raw secret values", async () => {
    const frame = await generateSkillFrame({ skillfile: parseSkillfileMarkdown(`${skillMarkdown()}\n\n## Secrets\n- OPENAI_API_KEY`), now });
    const result = generateWorkflowSkill({ frame, capability_snapshot: snapshot(), now });
    expect(result.markdown).toContain("********");
    if (!result.workflow_skill) throw new Error("WorkflowSkill was not generated.");
    const unsafe = {
      ...result.workflow_skill,
      description: "token: sk-test-12345678901234567890",
    };
    expect(validateWorkflowSkill(unsafe, { capability_snapshot: snapshot() }).ok).toBe(false);
  });

  it("requires approval for side effects and previews without execution", async () => {
    const frame = await generateSkillFrame({ skillfile: parseSkillfileMarkdown(`${skillMarkdown()}\n\n## Permissions\n- repository:write\n- write files`), now });
    const result = generateWorkflowSkill({ frame, capability_snapshot: snapshot(), now });
    if (!result.workflow_skill) throw new Error("WorkflowSkill was not generated.");
    expect(result.workflow_skill.approval_policy.approval_required).toBe(true);
    const preview = previewWorkflowSkillRun({ workflow_skill: result.workflow_skill, capability_snapshot: snapshot() });
    expect(preview.status).toBe("dry_run");
    expect(preview.planfile_markdown).toContain("## Executable Plan");
  });
});

function skillMarkdown(): string {
  return [
    "# Repository Review Workflow",
    "",
    "## Goal",
    "Review repository files and produce a report.",
    "",
    "## Inputs",
    "- repository path",
    "",
    "## Outputs",
    "- review report",
    "",
    "## Tools",
    "- repository read",
    "- repository review",
  ].join("\n");
}

function snapshot() {
  return buildCapabilitySnapshot([
    {
      endpoint_id: "open-lagrange.repository",
      capability_name: "repo.read_file",
      description: "Read repository file",
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      risk_level: "read",
      requires_approval: false,
    },
    {
      endpoint_id: "open-lagrange.repository",
      capability_name: "repo.create_review_report",
      description: "Create repository review report",
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      risk_level: "read",
      requires_approval: false,
    },
    {
      endpoint_id: "open-lagrange.repository",
      capability_name: "repo.apply_patch",
      description: "Apply repository patch",
      input_schema: { type: "object" },
      output_schema: { type: "object" },
      risk_level: "write",
      requires_approval: true,
    },
  ], now);
}
