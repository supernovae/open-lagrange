import type { VerificationReport } from "../schemas/repository.js";

export function summarizeVerificationFailure(report: VerificationReport): string {
  const failed = report.results.filter((result) => result.exit_code !== 0);
  if (failed.length === 0) return "Verification passed.";
  return failed.map((result) => [
    `${result.command_id} failed with exit code ${result.exit_code}.`,
    result.stderr_preview || result.stdout_preview,
  ].filter(Boolean).join(" ")).join("\n");
}
