import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { stableHash } from "../util/hash.js";
import { Planfile } from "./planfile-schema.js";
import { canonicalPlanDigest } from "./planfile-validator.js";

export const ScheduleRecord = z.object({
  schedule_id: z.string().min(1),
  plan_id: z.string().min(1),
  planfile_path: z.string().min(1),
  plan_digest: z.string().regex(/^[a-f0-9]{64}$/),
  cadence: z.enum(["daily", "weekly", "cron"]),
  time_of_day: z.string().min(1).optional(),
  timezone: z.string().min(1),
  runtime_profile: z.string().min(1),
  output_policy: z.string().min(1),
  status: z.enum(["unsupported_for_automatic_execution", "ready_for_manual_run"]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).strict();

export type ScheduleRecord = z.infer<typeof ScheduleRecord>;

export function createScheduleRecord(input: {
  readonly planfile: unknown;
  readonly planfile_path: string;
  readonly cadence: "daily" | "weekly" | "cron";
  readonly time_of_day?: string;
  readonly timezone?: string;
  readonly runtime_profile?: string;
  readonly output_policy?: string;
  readonly now?: string;
  readonly index_path?: string;
}): ScheduleRecord {
  const now = input.now ?? new Date().toISOString();
  const plan = Planfile.parse(input.planfile);
  const digest = canonicalPlanDigest(plan);
  const record = ScheduleRecord.parse({
    schedule_id: `schedule_${stableHash({ plan_id: plan.plan_id, digest, cadence: input.cadence, time: input.time_of_day }).slice(0, 18)}`,
    plan_id: plan.plan_id,
    planfile_path: input.planfile_path,
    plan_digest: digest,
    cadence: input.cadence,
    ...(input.time_of_day ? { time_of_day: input.time_of_day } : {}),
    timezone: input.timezone ?? "local",
    runtime_profile: input.runtime_profile ?? "local",
    output_policy: input.output_policy ?? "append_artifacts",
    status: "unsupported_for_automatic_execution",
    created_at: now,
    updated_at: now,
  });
  writeScheduleRecord(record, input.index_path);
  return record;
}

export function listScheduleRecords(indexPath = defaultScheduleIndexPath()): ScheduleRecord[] {
  return readScheduleIndex(indexPath);
}

export function getScheduleRecord(scheduleId: string, indexPath = defaultScheduleIndexPath()): ScheduleRecord | undefined {
  return readScheduleIndex(indexPath).find((record) => record.schedule_id === scheduleId);
}

function writeScheduleRecord(record: ScheduleRecord, indexPath = defaultScheduleIndexPath()): void {
  const records = readScheduleIndex(indexPath).filter((item) => item.schedule_id !== record.schedule_id);
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, JSON.stringify({ schedules: [...records, record] }, null, 2), "utf8");
}

function readScheduleIndex(indexPath: string): ScheduleRecord[] {
  if (!existsSync(indexPath)) return [];
  const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as { schedules?: unknown };
  if (!Array.isArray(parsed.schedules)) return [];
  return parsed.schedules.flatMap((item) => {
    const result = ScheduleRecord.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

function defaultScheduleIndexPath(): string {
  return join(".open-lagrange", "schedules", "schedule-index.json");
}
