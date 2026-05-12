import { existsSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import type { ArtifactSummary } from "../../artifacts/index.js";

export function artifactAllowedForOutput(input: {
  readonly artifact: ArtifactSummary;
  readonly include_model_calls?: boolean;
  readonly include_raw_logs?: boolean;
  readonly include_redacted_only?: boolean;
}): { readonly allowed: true } | { readonly allowed: false; readonly reason: "redaction_required" | "restricted" | "raw_log_excluded" | "model_call_excluded" } {
  if (input.artifact.restricted) return { allowed: false, reason: "restricted" };
  if (input.artifact.kind === "raw_log" && input.include_raw_logs !== true) return { allowed: false, reason: "raw_log_excluded" };
  if (input.artifact.kind === "model_call" && input.include_model_calls !== true) return { allowed: false, reason: "model_call_excluded" };
  if (input.include_redacted_only !== false && (input.artifact.redacted === false || input.artifact.redaction_status === "not_redacted")) return { allowed: false, reason: "redaction_required" };
  return { allowed: true };
}

export function validateOutputPath(path: string): string {
  if (path.includes("\0")) throw new Error("Output path must not contain NUL bytes.");
  const absolute = resolve(path);
  if (existsSync(absolute) && !statSync(absolute).isDirectory()) return absolute;
  const parent = dirname(absolute);
  if (parent.split(sep).includes("..")) throw new Error("Output path must resolve to a concrete location.");
  return absolute;
}

export function safeArchiveEntryName(input: string): string {
  const value = input.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = value.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) throw new Error(`Unsafe archive entry path: ${input}`);
  return parts.map((part) => part.replace(/[^a-zA-Z0-9._-]+/g, "_")).join("/");
}
