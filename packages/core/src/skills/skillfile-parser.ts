import YAML from "yaml";
import { ParsedSkillfile, type ParsedSkillfile as ParsedSkillfileType } from "./skillfile-schema.js";
import { WorkflowSkill, type WorkflowSkill as WorkflowSkillType } from "./workflow-skill.js";

const WORKFLOW_SKILL_BLOCK = /```(?:yaml|yml|json)\s+workflow_skill\s*\n([\s\S]*?)```/i;

export function parseSkillfileMarkdown(markdown: string): ParsedSkillfileType {
  const text = markdown.trim();
  if (!text) throw new Error("Skillfile is empty.");
  const lines = text.split(/\r?\n/);
  const titleLine = lines.find((line) => /^#\s+/.test(line));
  const title = titleLine?.replace(/^#\s+/, "").trim();
  const sections: { heading: string; body: string }[] = [];
  let current: { heading: string; body: string[] } | undefined;
  const preface: string[] = [];
  for (const line of lines) {
    const match = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (current) sections.push({ heading: normalizeHeading(current.heading), body: current.body.join("\n").trim() });
      current = { heading: match[2] ?? "", body: [] };
      continue;
    }
    if (current) current.body.push(line);
    else preface.push(line);
  }
  if (current) sections.push({ heading: normalizeHeading(current.heading), body: current.body.join("\n").trim() });
  return ParsedSkillfile.parse({
    original_markdown: markdown,
    ...(title ? { title } : {}),
    sections,
    unsectioned_body: preface.join("\n").trim(),
  });
}

export function sectionBody(skillfile: ParsedSkillfileType, heading: string): string | undefined {
  const normalized = normalizeHeading(heading);
  return skillfile.sections.find((section) => section.heading === normalized)?.body;
}

export function parseWorkflowSkillMarkdown(markdownOrYaml: string): WorkflowSkillType {
  const match = WORKFLOW_SKILL_BLOCK.exec(markdownOrYaml);
  const source = match?.[1] ?? markdownOrYaml;
  return WorkflowSkill.parse(YAML.parse(source));
}

export function normalizeHeading(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
