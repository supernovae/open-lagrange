import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { inMemoryStatusStore, parseTaskStatus, type TaskStatusSnapshot } from "../status/status-store.js";
import { WorkflowStatusSnapshot } from "../schemas/reconciliation.js";
import { z } from "zod";

const RecordStatusInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), snapshot: WorkflowStatusSnapshot }).strict(),
  z.object({ kind: z.literal("task"), snapshot: z.custom<TaskStatusSnapshot>() }).strict(),
]);

export const recordStatusTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "record-status",
  retries: 0,
  executionTimeout: "10s",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = RecordStatusInput.parse(input);
    if (parsed.kind === "project") return toHatchetJsonObject(await inMemoryStatusStore.recordProjectStatus(parsed.snapshot));
    return toHatchetJsonObject(await inMemoryStatusStore.recordTaskStatus(parseTaskStatus(parsed.snapshot)));
  },
});
