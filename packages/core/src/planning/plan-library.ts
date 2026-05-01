import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { derivePlanRequirements } from "./plan-requirements.js";
import { parsePlanfileMarkdown, parsePlanfileYaml } from "./planfile-parser.js";

export const PlanLibraryEntry = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  source: z.enum(["workspace", "home"]),
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  plan_id: z.string().min(1).optional(),
  template_id: z.string().min(1).optional(),
  portability_level: z.enum(["portable", "workspace_bound", "profile_bound", "machine_bound"]).optional(),
}).strict();

export type PlanLibraryEntry = z.infer<typeof PlanLibraryEntry>;

export const PlanLibraryManifest = z.object({
  name: z.string().min(1).optional(),
  plans: z.array(z.object({
    name: z.string().min(1),
    path: z.string().min(1),
    title: z.string().min(1).optional(),
    summary: z.string().min(1).optional(),
  }).strict()).default([]),
}).strict();

export type PlanLibraryManifest = z.infer<typeof PlanLibraryManifest>;

export interface ListPlanLibraryInput {
  readonly roots?: readonly string[];
}

export function defaultPlanLibraryRoots(workspaceRoot = process.cwd(), homeRoot = homedir()): readonly string[] {
  return [join(workspaceRoot, ".open-lagrange", "plans"), join(homeRoot, ".open-lagrange", "plans")];
}

export function listPlanLibrary(input: ListPlanLibraryInput = {}): PlanLibraryEntry[] {
  const roots = input.roots ?? defaultPlanLibraryRoots();
  return roots.flatMap((root, index) => listRoot(root, index === 0 ? "workspace" : "home"));
}

export function addPlanLibraryEntry(input: {
  readonly name: string;
  readonly path: string;
  readonly title?: string;
  readonly summary?: string;
  readonly manifest_path?: string;
}): PlanLibraryManifest {
  const manifestPath = input.manifest_path ?? join(".open-lagrange", "plans", "open-lagrange-plans.yaml");
  const current = readManifest(manifestPath);
  const nextPlans = [
    ...current.plans.filter((entry) => entry.name !== input.name),
    {
      name: input.name,
      path: input.path,
      ...(input.title ? { title: input.title } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
    },
  ].sort((left, right) => left.name.localeCompare(right.name));
  const next = PlanLibraryManifest.parse({ ...current, plans: nextPlans });
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, YAML.stringify(next), "utf8");
  return next;
}

export function syncPlanLibrary(input: ListPlanLibraryInput = {}): {
  readonly status: "completed";
  readonly message: string;
  readonly plans: readonly PlanLibraryEntry[];
} {
  const plans = listPlanLibrary(input);
  return { status: "completed", message: `Local plan library refreshed: ${plans.length} plan(s).`, plans };
}

export function instantiatePlanTemplate(input: {
  readonly template_path: string;
  readonly params?: Record<string, string>;
  readonly write_path?: string;
}): {
  readonly status: "completed";
  readonly path?: string;
  readonly content: string;
} {
  const content = renderTemplate(readFileSync(input.template_path, "utf8"), input.params ?? {});
  if (input.write_path) {
    mkdirSync(dirname(input.write_path), { recursive: true });
    writeFileSync(input.write_path, content, "utf8");
    return { status: "completed", path: input.write_path, content };
  }
  return { status: "completed", content };
}

function listRoot(root: string, source: "workspace" | "home"): PlanLibraryEntry[] {
  if (!existsSync(root)) return [];
  const manifestEntries = manifestEntriesFor(root, source);
  const manifestPaths = new Set(manifestEntries.map((entry) => resolvePath(root, entry.path)));
  const discovered = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isPlanfileName(entry.name))
    .map((entry) => entryForPlanPath(join(root, entry.name), source))
    .filter((entry) => !manifestPaths.has(resolve(entry.path)));
  return [...manifestEntries, ...discovered].sort((left, right) => left.name.localeCompare(right.name));
}

function manifestEntriesFor(root: string, source: "workspace" | "home"): PlanLibraryEntry[] {
  const manifestPath = join(root, "open-lagrange-plans.yaml");
  const manifest = readManifest(manifestPath);
  return manifest.plans.flatMap((entry) => {
    const path = resolvePath(root, entry.path);
    const parsed = existsSync(path) ? planMetadata(path) : undefined;
    return [PlanLibraryEntry.parse({
      name: entry.name,
      path,
      source,
      ...(entry.title ?? parsed?.title ? { title: entry.title ?? parsed?.title } : {}),
      ...(entry.summary ?? parsed?.summary ? { summary: entry.summary ?? parsed?.summary } : {}),
      ...(parsed?.plan_id ? { plan_id: parsed.plan_id } : {}),
      ...(parsed?.template_id ? { template_id: parsed.template_id } : {}),
      ...(parsed?.portability_level ? { portability_level: parsed.portability_level } : {}),
    })];
  });
}

function entryForPlanPath(path: string, source: "workspace" | "home"): PlanLibraryEntry {
  const parsed = planMetadata(path);
  return PlanLibraryEntry.parse({
    name: basename(path).replace(/\.plan\.(md|ya?ml)$/u, ""),
    path,
    source,
    ...(parsed?.title ? { title: parsed.title } : {}),
    ...(parsed?.summary ? { summary: parsed.summary } : {}),
    ...(parsed?.plan_id ? { plan_id: parsed.plan_id } : {}),
    ...(parsed?.template_id ? { template_id: parsed.template_id } : {}),
    ...(parsed?.portability_level ? { portability_level: parsed.portability_level } : {}),
  });
}

function planMetadata(path: string): {
  readonly title?: string;
  readonly summary?: string;
  readonly plan_id?: string;
  readonly template_id?: string;
  readonly portability_level?: PlanLibraryEntry["portability_level"];
} | undefined {
  try {
    const content = readFileSync(path, "utf8");
    const plan = path.endsWith(".md") ? parsePlanfileMarkdown(content) : parsePlanfileYaml(content);
    const context = plan.execution_context as Record<string, unknown> | undefined;
    const template = context?.template && typeof context.template === "object" ? context.template as Record<string, unknown> : undefined;
    const requirements = derivePlanRequirements({ planfile: plan });
    return {
      title: plan.goal_frame.interpreted_goal,
      summary: `${plan.nodes.length} node(s), ${requirements.side_effects.join(", ") || "no side effects"}`,
      plan_id: plan.plan_id,
      ...(typeof template?.template_id === "string" ? { template_id: template.template_id } : {}),
      portability_level: requirements.portability_level,
    };
  } catch {
    return undefined;
  }
}

function readManifest(path: string): PlanLibraryManifest {
  if (!existsSync(path)) return PlanLibraryManifest.parse({ plans: [] });
  return PlanLibraryManifest.parse(YAML.parse(readFileSync(path, "utf8")) ?? { plans: [] });
}

function resolvePath(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

function isPlanfileName(name: string): boolean {
  return /\.plan\.(md|ya?ml)$/u.test(name);
}

function renderTemplate(content: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((next, [key, value]) =>
    next.replaceAll(`\${${key}}`, value).replaceAll(`{{${key}}}`, value), content);
}
