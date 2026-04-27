import type { JsonObject } from "@hatchet-dev/typescript-sdk";
import type { z } from "zod";

export type HatchetJsonObject = JsonObject;

export function toHatchetJsonObject(value: unknown): HatchetJsonObject {
  const roundTripped = JSON.parse(JSON.stringify(value)) as unknown;
  if (!roundTripped || typeof roundTripped !== "object" || Array.isArray(roundTripped)) {
    throw new Error("Hatchet task boundary expected a JSON object");
  }
  return roundTripped as HatchetJsonObject;
}

export function parseHatchetJsonObject<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}
