export class PlanCompositionError extends Error {
  constructor(
    message: string,
    readonly code: "BLOCKING_AMBIGUITY" | "MISSING_CAPABILITY" | "UNSUPPORTED_INTENT",
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PlanCompositionError";
  }
}
