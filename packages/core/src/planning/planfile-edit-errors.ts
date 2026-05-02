export class PlanfileEditError extends Error {
  constructor(
    readonly code: "SESSION_NOT_FOUND" | "NO_CURRENT_PLANFILE" | "PARSE_FAILED" | "VALIDATION_FAILED" | "UNSAFE_EDIT",
    message: string,
  ) {
    super(message);
    this.name = "PlanfileEditError";
  }
}
