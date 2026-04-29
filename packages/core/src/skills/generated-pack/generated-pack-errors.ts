export class GeneratedPackError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "GeneratedPackError";
  }
}

export function generatedPackInvalid(message: string, details: Record<string, unknown> = {}): GeneratedPackError {
  return new GeneratedPackError("GENERATED_PACK_INVALID", message, details);
}

export function generatedPackInstallDenied(message: string, details: Record<string, unknown> = {}): GeneratedPackError {
  return new GeneratedPackError("GENERATED_PACK_INSTALL_DENIED", message, details);
}
