import type { CapabilitySummary } from "./capability-discovery.js";

export function explainSystem(summary?: CapabilitySummary): string {
  const packCount = summary?.packs.length ?? 0;
  const demoCount = summary?.demos.length ?? 0;
  return [
    "Open Lagrange turns goals into typed plans, capability-scoped work, approvals, verification, and artifacts.",
    `Current runtime has ${packCount} packs and ${demoCount} demos available.`,
    "Try: /plan repo \"add json output to my cli\", /pack build ./skills.md, /demos, /doctor, or ask what can you do?",
  ].join(" ");
}

export function explainApproval(): string {
  return "Approval is required when a flow may write files, run verification commands, call external side effects, or otherwise cross a configured policy gate.";
}

export function explainError(input: unknown): string {
  if (input instanceof Error) return input.message;
  return typeof input === "string" ? input : "No detailed error was available.";
}

export function summarizeStatus(summary: CapabilitySummary): string {
  const unhealthy = summary.pack_health.filter((item) => typeof item === "object" && item && (item as { status?: unknown }).status !== "healthy").length;
  return `Runtime summary: ${summary.packs.length} packs, ${summary.demos.length} demos, ${summary.artifacts.length} recent artifacts, ${unhealthy} pack health issues.`;
}

export function explainArtifact(input: { readonly artifact_id: string; readonly kind?: string; readonly title?: string }): string {
  return `Artifact ${input.artifact_id}${input.title ? ` (${input.title})` : ""}${input.kind ? ` is a ${input.kind}` : ""}. Use /artifact show ${input.artifact_id} to inspect it.`;
}
