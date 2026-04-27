import { CapabilitySdkError } from "./errors.js";
import type { CapabilityDefinition, CapabilityExecutionResult, PackExecutionContext } from "./types.js";

export async function executeDefinition(
  definition: CapabilityDefinition,
  context: PackExecutionContext,
  input: unknown,
): Promise<CapabilityExecutionResult> {
  const started = Date.now();
  const started_at = new Date(started).toISOString();
  const parsedInput = definition.input_schema.safeParse(input);
  if (!parsedInput.success) {
    return result("failed", context, started, started_at, undefined, [{
      code: "SCHEMA_VALIDATION_FAILED",
      message: parsedInput.error.message,
    }]);
  }

  try {
    const output = await definition.execute(context, parsedInput.data);
    const parsedOutput = definition.output_schema.safeParse(output);
    if (!parsedOutput.success) {
      return result("failed", context, started, started_at, undefined, [{
        code: "RESULT_VALIDATION_FAILED",
        message: parsedOutput.error.message,
      }]);
    }
    return result("success", context, started, started_at, parsedOutput.data, []);
  } catch (error) {
    return result("failed", context, started, started_at, undefined, [{
      code: error instanceof CapabilitySdkError ? error.code : "CAPABILITY_EXECUTION_FAILED",
      message: error instanceof Error ? error.message : "Capability execution failed",
    }]);
  }
}

function result(
  status: CapabilityExecutionResult["status"],
  context: PackExecutionContext,
  started: number,
  started_at: string,
  output: unknown,
  structured_errors: readonly unknown[],
): CapabilityExecutionResult {
  const completed = Date.now();
  return {
    status,
    ...(output === undefined ? {} : { output }),
    observations: [],
    structured_errors,
    artifacts: [],
    started_at,
    completed_at: new Date(completed).toISOString(),
    duration_ms: Math.max(0, completed - started),
    idempotency_key: context.idempotency_key,
  };
}
