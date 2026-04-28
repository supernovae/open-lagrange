import YAML from "yaml";
import { Planfile, type Planfile as PlanfileType } from "./planfile-schema.js";
import { PlanfileParseError } from "./plan-errors.js";

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g;

export function extractExecutableYaml(markdown: string): string {
  const candidates: string[] = [];
  for (const match of markdown.matchAll(FENCE)) {
    const info = String(match[1] ?? "").trim().toLowerCase();
    if (!info.startsWith("yaml") && !info.startsWith("yml")) continue;
    const body = String(match[2] ?? "").trim();
    if (body.includes("schema_version: open-lagrange.plan.v1")) candidates.push(body);
  }
  if (candidates.length === 0) throw new PlanfileParseError("No executable Planfile YAML block found.");
  if (candidates.length > 1) throw new PlanfileParseError("Multiple executable Planfile YAML blocks found.");
  return candidates[0] ?? "";
}

export function parsePlanfileMarkdown(markdown: string): PlanfileType {
  return parsePlanfileYaml(extractExecutableYaml(markdown));
}

export function parsePlanfileYaml(yamlText: string): PlanfileType {
  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid YAML.";
    throw new PlanfileParseError(message);
  }
  return Planfile.parse(parsed);
}
