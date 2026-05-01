import type { RepositoryVerificationReport } from "./verification-report.js";

export function summarizeVerificationFailure(report: RepositoryVerificationReport): string {
  const failed = report.command_results.filter((result) => result.status !== "passed");
  if (failed.length === 0) return "Verification passed.";
  return failed.map((result) => [
    `${result.command_id} ${result.status}${result.exit_code === null ? "" : ` with exit code ${result.exit_code}`}.`,
    result.stderr_preview || result.stdout_preview,
  ].filter(Boolean).join(" ")).join("\n");
}
