export class PatchPlanGenerationError extends Error {
  constructor(
    readonly code: "MODEL_PROVIDER_UNAVAILABLE" | "PATCH_PLAN_GENERATION_FAILED",
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PatchPlanGenerationError";
  }
}

export function modelProviderUnavailable(): PatchPlanGenerationError {
  return new PatchPlanGenerationError(
    "MODEL_PROVIDER_UNAVAILABLE",
    "PatchPlan generation requires a configured model provider.",
    {
      remediation: [
        "configure a model provider credential",
        "run open-lagrange secrets set <provider-key>",
        "use an injected mock generator only in test or demo mode",
      ],
    },
  );
}
