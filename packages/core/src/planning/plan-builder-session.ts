import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { IntentFrame } from "./intent-frame.js";
import type { PlanValidationResult } from "./plan-errors.js";
import { PlannerQuestion } from "./plan-builder-question.js";
import { PlanBuilderStatus } from "./plan-builder-status.js";
import { PlanRevision } from "./plan-revision.js";
import { PlanSimulationReport } from "./plan-simulation.js";
import { Planfile } from "./planfile-schema.js";

export const PlanValidationReportSchema = z.custom<PlanValidationResult>();

export const PlanBuilderSession = z.object({
  session_id: z.string().min(1),
  prompt_source: z.enum(["chat", "skills_file", "planfile", "template"]),
  original_input: z.string().min(1),
  current_intent_frame: IntentFrame.optional(),
  current_planfile: Planfile.optional(),
  simulation_report: PlanSimulationReport.optional(),
  validation_report: PlanValidationReportSchema.optional(),
  pending_questions: z.array(PlannerQuestion),
  answered_questions: z.array(PlannerQuestion),
  revision_history: z.array(PlanRevision),
  status: PlanBuilderStatus,
  yield_reason: z.string().min(1).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).strict();

export type PlanBuilderSession = z.infer<typeof PlanBuilderSession>;

export function savePlanBuilderSession(session: PlanBuilderSession, root = defaultPlanBuilderRoot()): PlanBuilderSession {
  const parsed = PlanBuilderSession.parse(session);
  const path = sessionPath(parsed.session_id, root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(parsed, null, 2), "utf8");
  writeSessionIndex(parsed, root);
  return parsed;
}

export function getPlanBuilderSession(sessionId: string, root = defaultPlanBuilderRoot()): PlanBuilderSession | undefined {
  const path = sessionPath(sessionId, root);
  if (!existsSync(path)) return undefined;
  return PlanBuilderSession.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function listPlanBuilderSessions(root = defaultPlanBuilderRoot()): PlanBuilderSession[] {
  const indexPath = join(root, "index.json");
  if (!existsSync(indexPath)) return [];
  const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as { sessions?: { session_id?: string }[] };
  return (parsed.sessions ?? []).flatMap((item) => item.session_id ? getPlanBuilderSession(item.session_id, root) ?? [] : []);
}

export function defaultPlanBuilderRoot(): string {
  return join(".open-lagrange", "plan-builder", "sessions");
}

function sessionPath(sessionId: string, root: string): string {
  return join(root, `${sessionId}.json`);
}

function writeSessionIndex(session: PlanBuilderSession, root: string): void {
  const indexPath = join(root, "index.json");
  const current = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) as { sessions?: unknown[] } : { sessions: [] };
  const sessions = (Array.isArray(current.sessions) ? current.sessions : [])
    .filter((item) => !(item && typeof item === "object" && (item as { session_id?: unknown }).session_id === session.session_id));
  sessions.push({
    session_id: session.session_id,
    status: session.status,
    prompt_source: session.prompt_source,
    plan_id: session.current_planfile?.plan_id,
    updated_at: session.updated_at,
  });
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, JSON.stringify({ sessions }, null, 2), "utf8");
}
