import * as restate from "@restatedev/restate-sdk";
import { cognitiveReconciler } from "./workflows/reconciler.js";

export * from "./activities/cognition.js";
export * from "./mcp/mock-registry.js";
export * from "./policy/policy-gate.js";
export * from "./schemas/capabilities.js";
export * from "./schemas/open-cot.js";
export * from "./workflows/reconciler.js";

export const lagrangeServices = [cognitiveReconciler] as const;

if (process.env.LAGRANGE_SERVE === "1") {
  restate.serve({ services: [...lagrangeServices] });
}
