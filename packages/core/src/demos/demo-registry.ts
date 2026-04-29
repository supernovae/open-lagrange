import { z } from "zod";

export const DemoId = z.enum(["repo-json-output", "skills-research-brief", "skills-notes-draft"]);

export const DemoDefinition = z.object({
  demo_id: DemoId,
  title: z.string().min(1),
  summary: z.string(),
  example_path: z.string().min(1),
  dry_run_default: z.boolean(),
  mocked: z.boolean(),
}).strict();

export type DemoId = z.infer<typeof DemoId>;
export type DemoDefinition = z.infer<typeof DemoDefinition>;

export const DEMOS: readonly DemoDefinition[] = [
  DemoDefinition.parse({
    demo_id: "repo-json-output",
    title: "Repository Plan-to-Patch",
    summary: "Creates a Planfile and preview artifacts for adding JSON output to a tiny CLI fixture.",
    example_path: "examples/repo-json-output",
    dry_run_default: true,
    mocked: true,
  }),
  DemoDefinition.parse({
    demo_id: "skills-research-brief",
    title: "Research Brief Workflow Skill",
    summary: "Builds a WorkflowSkill and mocked cited brief from deterministic source fixtures.",
    example_path: "examples/skills-research-brief",
    dry_run_default: true,
    mocked: true,
  }),
  DemoDefinition.parse({
    demo_id: "skills-notes-draft",
    title: "Notes Draft Workflow Skill",
    summary: "Small skill demo that turns a notes workflow into a Planfile-backed artifact.",
    example_path: "examples/skills-notes-draft",
    dry_run_default: true,
    mocked: true,
  }),
];

export function listDemos(): readonly DemoDefinition[] {
  return DEMOS;
}

export function getDemo(demoId: string): DemoDefinition | undefined {
  return DEMOS.find((demo) => demo.demo_id === demoId);
}
