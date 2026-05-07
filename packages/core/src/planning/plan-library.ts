import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { analyzePlanPortability } from "./plan-portability.js";
import { derivePlanRequirements } from "./plan-requirements.js";
import { getPlanBuilderSession } from "./plan-builder-session.js";
import { parsePlanfileMarkdown, parsePlanfileYaml } from "./planfile-parser.js";
import { renderPlanfileMarkdown } from "./planfile-markdown.js";
import { Planfile } from "./planfile-schema.js";

export const PlanLibraryEntry = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  source: z.enum(["workspace", "home"]),
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  plan_id: z.string().min(1).optional(),
  template_id: z.string().min(1).optional(),
  portability_level: z.enum(["portable", "workspace_bound", "profile_bound", "machine_bound"]).optional(),
}).strict();

export type PlanLibraryEntry = z.infer<typeof PlanLibraryEntry>;

export const PlanLibraryPlanManifestEntry = z.object({
  name: z.string().min(1).optional(),
  path: z.string().min(1),
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).default([]),
}).strict();

export const PlanLibraryManifest = z.object({
  schema_version: z.literal("open-lagrange.plan-library.v1").default("open-lagrange.plan-library.v1"),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  plans: z.array(PlanLibraryPlanManifestEntry).default([]),
}).strict();

export const PlanLibraryRoot = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  source: z.enum(["workspace", "home", "configured"]),
  description: z.string().min(1).optional(),
  plan_count: z.number().int().min(0),
  manifest_path: z.string().min(1),
}).strict();

export const PlanLibraryConfig = z.object({
  schema_version: z.literal("open-lagrange.plan-libraries.v1").default("open-lagrange.plan-libraries.v1"),
  libraries: z.array(z.object({
    name: z.string().min(1),
    path: z.string().min(1),
    description: z.string().min(1).optional(),
  }).strict()).default([]),
}).strict();

export type PlanLibraryPlanManifestEntry = z.infer<typeof PlanLibraryPlanManifestEntry>;
export type PlanLibraryRoot = z.infer<typeof PlanLibraryRoot>;
export type PlanLibraryConfig = z.infer<typeof PlanLibraryConfig>;

const MANIFEST_FILE = "open-lagrange-plans.yaml";
const LIBRARY_CONFIG_FILE = "plan-libraries.yaml";

export const SavedPlanfileResult = z.object({
  library: z.string().min(1),
  path: z.string().min(1),
  portability: z.enum(["portable", "workspace_bound", "profile_bound", "machine_bound"]),
  warnings: z.array(z.string().min(1)),
}).strict();

export type SavedPlanfileResult = z.infer<typeof SavedPlanfileResult>;

export const PlanLibraryPlanDetail = z.object({
  entry: PlanLibraryEntry,
  content: z.string(),
}).strict();

export type PlanLibraryPlanDetail = z.infer<typeof PlanLibraryPlanDetail>;

/*
 * Kept for old callers that expect one flat list. New surfaces should use
 * listPlanLibraries and listPlanLibraryPlans to keep library identity visible.
 */
export const LegacyPlanLibraryManifest = z.object({
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

export function listPlanLibraries(input: ListPlanLibraryInput & { readonly workspace_root?: string; readonly home_root?: string } = {}): PlanLibraryRoot[] {
  const workspaceRoot = input.workspace_root ?? process.cwd();
  const homeRoot = input.home_root ?? homedir();
  const configured = readLibraryConfig(configPath(workspaceRoot)).libraries.map((library) => ({
    name: library.name,
    path: resolvePath(workspaceRoot, library.path),
    source: "configured" as const,
    ...(library.description ? { description: library.description } : {}),
  }));
  const roots = [
    { name: "workspace", path: join(workspaceRoot, ".open-lagrange", "plans"), source: "workspace" as const, description: "Workspace reusable plans" },
    { name: "personal", path: join(homeRoot, ".open-lagrange", "plans"), source: "home" as const, description: "Personal reusable plans" },
    ...configured,
  ];
  return roots.map((root) => {
    const manifest = readManifest(join(root.path, MANIFEST_FILE));
    return PlanLibraryRoot.parse({
      name: root.name,
      path: root.path,
      source: root.source,
      ...(root.description ?? manifest.description ? { description: root.description ?? manifest.description } : {}),
      plan_count: listRoot(root.path, root.source === "home" ? "home" : "workspace").length,
      manifest_path: join(root.path, MANIFEST_FILE),
    });
  }).sort((left, right) => left.name.localeCompare(right.name));
}

export function listPlanLibrary(input: ListPlanLibraryInput = {}): PlanLibraryEntry[] {
  const roots = input.roots ?? defaultPlanLibraryRoots();
  return roots.flatMap((root, index) => listRoot(root, index === 0 ? "workspace" : "home"));
}

export function listPlanLibraryPlans(input: { readonly library?: string; readonly workspace_root?: string; readonly home_root?: string } = {}): PlanLibraryEntry[] {
  const libraries = listPlanLibraries(rootOptions(input));
  const selected = input.library ? libraries.filter((library) => library.name === input.library) : libraries;
  return selected.flatMap((library) => listRoot(library.path, library.source === "home" ? "home" : "workspace"));
}

export function addPlanLibrary(input: {
  readonly name: string;
  readonly path: string;
  readonly description?: string;
  readonly workspace_root?: string;
}): PlanLibraryConfig {
  const workspaceRoot = input.workspace_root ?? process.cwd();
  const path = resolvePath(workspaceRoot, input.path);
  mkdirSync(path, { recursive: true });
  const current = readLibraryConfig(configPath(workspaceRoot));
  const next = PlanLibraryConfig.parse({
    ...current,
    libraries: [
      ...current.libraries.filter((library) => library.name !== input.name),
      {
        name: input.name,
        path,
        ...(input.description ? { description: input.description } : {}),
      },
    ].sort((left, right) => left.name.localeCompare(right.name)),
  });
  writeLibraryConfig(configPath(workspaceRoot), next);
  ensureManifest(path, input.name, input.description);
  return next;
}

export function removePlanLibrary(input: { readonly name: string; readonly workspace_root?: string }): PlanLibraryConfig {
  if (input.name === "workspace" || input.name === "personal") throw new Error(`Default library cannot be removed: ${input.name}`);
  const workspaceRoot = input.workspace_root ?? process.cwd();
  const current = readLibraryConfig(configPath(workspaceRoot));
  const next = PlanLibraryConfig.parse({ ...current, libraries: current.libraries.filter((library) => library.name !== input.name) });
  writeLibraryConfig(configPath(workspaceRoot), next);
  return next;
}

export function showPlanLibrary(input: { readonly name: string; readonly workspace_root?: string; readonly home_root?: string }): {
  readonly library: PlanLibraryRoot;
  readonly plans: readonly PlanLibraryEntry[];
} {
  const library = listPlanLibraries(rootOptions(input)).find((candidate) => candidate.name === input.name);
  if (!library) throw new Error(`Plan library was not found: ${input.name}`);
  return { library, plans: listRoot(library.path, library.source === "home" ? "home" : "workspace") };
}

export function showPlanFromLibrary(input: { readonly library?: string; readonly plan: string; readonly workspace_root?: string; readonly home_root?: string }): PlanLibraryPlanDetail {
  const entry = resolvePlanLibraryEntry(input);
  return PlanLibraryPlanDetail.parse({ entry, content: readFileSync(entry.path, "utf8") });
}

export function resolvePlanLibraryEntry(input: { readonly library?: string; readonly plan: string; readonly workspace_root?: string; readonly home_root?: string }): PlanLibraryEntry {
  const planPath = resolvePath(input.workspace_root ?? process.cwd(), input.plan);
  if (existsSync(planPath)) return entryForPlanPath(planPath, "workspace");
  const plans = listPlanLibraryPlans({ ...(input.library ? { library: input.library } : {}), ...rootOptions(input) });
  const found = plans.find((entry) =>
    entry.name === input.plan
    || entry.plan_id === input.plan
    || entry.path === input.plan
    || entry.path.endsWith(`/${input.plan}`)
    || relative(dirname(entry.path), entry.path) === input.plan);
  if (!found) throw new Error(`Plan was not found in the Plan Library: ${input.plan}`);
  return found;
}

export function savePlanToLibrary(input: {
  readonly planfile_path: string;
  readonly library?: string;
  readonly path: string;
  readonly tags?: readonly string[];
  readonly workspace_root?: string;
  readonly home_root?: string;
}): SavedPlanfileResult {
  const target = resolveSaveTarget(input);
  mkdirSync(dirname(target.path), { recursive: true });
  copyFileSync(input.planfile_path, target.path);
  return recordSavedPlan({ ...target, tags: input.tags ?? [] });
}

export function savePlanfileContentToLibrary(input: {
  readonly content: string;
  readonly library?: string;
  readonly path: string;
  readonly tags?: readonly string[];
  readonly workspace_root?: string;
  readonly home_root?: string;
}): SavedPlanfileResult {
  const target = resolveSaveTarget(input);
  mkdirSync(dirname(target.path), { recursive: true });
  writeFileSync(target.path, input.content, "utf8");
  return recordSavedPlan({ ...target, tags: input.tags ?? [] });
}

export function saveBuilderSessionToLibrary(input: {
  readonly session_id: string;
  readonly library?: string;
  readonly path: string;
  readonly tags?: readonly string[];
  readonly workspace_root?: string;
  readonly home_root?: string;
}): SavedPlanfileResult {
  const session = getPlanBuilderSession(input.session_id);
  if (!session?.current_planfile) throw new Error(`Plan Builder session ${input.session_id} does not have a current Planfile.`);
  return savePlanfileContentToLibrary({
    content: renderPlanfileMarkdown(session.current_planfile),
    path: input.path,
    ...(input.library ? { library: input.library } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.workspace_root ? { workspace_root: input.workspace_root } : {}),
    ...(input.home_root ? { home_root: input.home_root } : {}),
  });
}

export function addPlanLibraryEntry(input: {
  readonly name: string;
  readonly path: string;
  readonly title?: string;
  readonly summary?: string;
  readonly manifest_path?: string;
}): PlanLibraryManifest {
  const manifestPath = input.manifest_path ?? join(".open-lagrange", "plans", MANIFEST_FILE);
  const current = readManifest(manifestPath);
  const nextPlans = [
    ...current.plans.filter((entry) => entry.name !== input.name),
    {
      name: input.name,
      path: input.path,
      ...(input.title ? { title: input.title } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
    },
  ].sort((left, right) => (left.name ?? left.path).localeCompare(right.name ?? right.path));
  const next = PlanLibraryManifest.parse({ ...current, plans: nextPlans });
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, YAML.stringify(next), "utf8");
  return next;
}

export function syncPlanLibrary(input: ListPlanLibraryInput = {}): {
  readonly status: "completed" | "manual_git_required";
  readonly message: string;
  readonly plans: readonly PlanLibraryEntry[];
} {
  const plans = listPlanLibrary(input);
  return {
    status: "manual_git_required",
    message: `Local plan library refreshed: ${plans.length} plan(s). Git-backed plan library sync is not implemented yet. Use a local cloned directory and run git manually.`,
    plans,
  };
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
  const discovered = discoverPlanfiles(root)
    .map((path) => entryForPlanPath(path, source))
    .filter((entry) => !manifestPaths.has(resolve(entry.path)));
  return [...manifestEntries, ...discovered].sort((left, right) => left.name.localeCompare(right.name));
}

function manifestEntriesFor(root: string, source: "workspace" | "home"): PlanLibraryEntry[] {
  const manifestPath = join(root, MANIFEST_FILE);
  const manifest = readManifest(manifestPath);
  return manifest.plans.flatMap((entry) => {
    const path = resolvePath(root, entry.path);
    const parsed = existsSync(path) ? planMetadata(path) : undefined;
    return [PlanLibraryEntry.parse({
      name: entry.name ?? basename(path).replace(/\.plan\.(md|ya?ml)$/u, ""),
      path,
      source,
      ...(entry.title ?? parsed?.title ? { title: entry.title ?? parsed?.title } : {}),
      ...(entry.summary ?? parsed?.summary ? { summary: entry.summary ?? parsed?.summary } : {}),
      ...(entry.tags.length > 0 ? { tags: entry.tags } : {}),
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
  const parsed = YAML.parse(readFileSync(path, "utf8")) ?? { plans: [] };
  if (parsed && typeof parsed === "object" && !("schema_version" in parsed)) {
    return PlanLibraryManifest.parse({ schema_version: "open-lagrange.plan-library.v1", ...parsed });
  }
  return PlanLibraryManifest.parse(parsed);
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

function discoverPlanfiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") return [];
      return discoverPlanfiles(path);
    }
    return entry.isFile() && isPlanfileName(entry.name) ? [path] : [];
  });
}

function configPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".open-lagrange", LIBRARY_CONFIG_FILE);
}

function readLibraryConfig(path: string): PlanLibraryConfig {
  if (!existsSync(path)) return PlanLibraryConfig.parse({ libraries: [] });
  const parsed = YAML.parse(readFileSync(path, "utf8")) ?? { libraries: [] };
  return PlanLibraryConfig.parse(parsed && typeof parsed === "object" && !("schema_version" in parsed)
    ? { schema_version: "open-lagrange.plan-libraries.v1", ...parsed }
    : parsed);
}

function writeLibraryConfig(path: string, config: PlanLibraryConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, YAML.stringify(config), "utf8");
}

function ensureManifest(root: string, name: string, description: string | undefined): void {
  const path = join(root, MANIFEST_FILE);
  if (existsSync(path)) return;
  mkdirSync(root, { recursive: true });
  writeFileSync(path, YAML.stringify(PlanLibraryManifest.parse({
    schema_version: "open-lagrange.plan-library.v1",
    name,
    ...(description ? { description } : {}),
    plans: [],
  })), "utf8");
}

function resolveSaveTarget(input: {
  readonly library?: string;
  readonly path: string;
  readonly workspace_root?: string;
  readonly home_root?: string;
}): { readonly library: PlanLibraryRoot; readonly path: string } {
  const libraryName = input.library ?? "workspace";
  const library = listPlanLibraries(rootOptions(input)).find((candidate) => candidate.name === libraryName);
  if (!library) throw new Error(`Plan library was not found: ${libraryName}`);
  const resolved = resolve(library.path, input.path);
  const relativePath = relative(library.path, resolved);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) throw new Error("Saved Planfile path must stay inside the selected library.");
  return { library, path: resolved };
}

function recordSavedPlan(input: {
  readonly library: PlanLibraryRoot;
  readonly path: string;
  readonly tags: readonly string[];
}): SavedPlanfileResult {
  const metadata = planMetadata(input.path);
  const manifest = readManifest(input.library.manifest_path);
  const relPath = relative(input.library.path, input.path);
  const next = PlanLibraryManifest.parse({
    ...manifest,
    name: manifest.name ?? input.library.name,
    plans: [
      ...manifest.plans.filter((entry) => entry.path !== relPath),
      {
        name: basename(input.path).replace(/\.plan\.(md|ya?ml)$/u, ""),
        path: relPath,
        ...(metadata?.title ? { title: metadata.title } : {}),
        ...(metadata?.summary ? { summary: metadata.summary } : {}),
        tags: [...input.tags],
      },
    ].sort((left, right) => (left.name ?? left.path).localeCompare(right.name ?? right.path)),
  });
  mkdirSync(dirname(input.library.manifest_path), { recursive: true });
  writeFileSync(input.library.manifest_path, YAML.stringify(next), "utf8");
  const portability = portabilityForPath(input.path);
  return SavedPlanfileResult.parse({
    library: input.library.name,
    path: input.path,
    portability: portability.portability,
    warnings: portability.warnings,
  });
}

function portabilityForPath(path: string): { readonly portability: SavedPlanfileResult["portability"]; readonly warnings: readonly string[] } {
  try {
    const content = readFileSync(path, "utf8");
    const plan = path.endsWith(".md") ? parsePlanfileMarkdown(content) : parsePlanfileYaml(content);
    return analyzePlanPortability({ planfile: Planfile.parse(plan) });
  } catch {
    return { portability: "machine_bound", warnings: ["Saved file could not be parsed as a Planfile."] };
  }
}

function rootOptions(input: { readonly workspace_root?: string; readonly home_root?: string }): { readonly workspace_root?: string; readonly home_root?: string } {
  return {
    ...(input.workspace_root ? { workspace_root: input.workspace_root } : {}),
    ...(input.home_root ? { home_root: input.home_root } : {}),
  };
}

export function removeSavedPlanFromLibrary(input: { readonly library?: string; readonly plan: string; readonly workspace_root?: string; readonly home_root?: string }): {
  readonly status: "removed";
  readonly path: string;
} {
  const entry = resolvePlanLibraryEntry(input);
  rmSync(entry.path, { force: true });
  return { status: "removed", path: entry.path };
}
