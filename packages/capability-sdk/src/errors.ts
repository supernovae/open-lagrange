export class CapabilitySdkError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "CapabilitySdkError";
  }
}
