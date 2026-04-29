import { z } from "zod";

export const SkillfileSection = z.object({
  heading: z.string().min(1),
  body: z.string(),
}).strict();

export const ParsedSkillfile = z.object({
  original_markdown: z.string().min(1),
  title: z.string().optional(),
  sections: z.array(SkillfileSection),
  unsectioned_body: z.string(),
}).strict();

export type SkillfileSection = z.infer<typeof SkillfileSection>;
export type ParsedSkillfile = z.infer<typeof ParsedSkillfile>;

export const SKILLFILE_COMMON_HEADINGS = [
  "goal",
  "inputs",
  "outputs",
  "rules",
  "constraints",
  "tools",
  "permissions",
  "secrets",
  "examples",
  "approval",
] as const;
