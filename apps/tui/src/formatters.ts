import type { PaneId } from "./types.js";

export function truncateText(value: string, max = 4000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n\n[truncated ${value.length - max} chars]`;
}

export function formatJson(value: unknown, max = 4000): string {
  return truncateText(JSON.stringify(value ?? null, null, 2), max);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function paneTitle(pane: PaneId): string {
  if (pane === "pack_builder") return "packs";
  if (pane === "artifact_json") return "artifacts";
  if (pane === "capabilities") return "providers";
  if (pane === "home") return "home";
  if (pane === "research") return "research shortcuts";
  if (pane === "repository") return "repository workbench";
  if (pane === "output") return "output";
  if (pane === "demo") return "sample Planfiles";
  if (pane === "run") return "runs";
  if (pane === "plan") return "plans";
  return pane.replace("_", " ");
}

export function statusColor(status: string): "green" | "yellow" | "red" | "cyan" {
  if (status === "completed") return "green";
  if (status === "failed" || status === "completed_with_errors") return "red";
  if (status === "requires_approval" || status === "yielded") return "yellow";
  return "cyan";
}
