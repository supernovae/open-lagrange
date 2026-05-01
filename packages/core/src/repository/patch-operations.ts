import { existsSync, readFileSync } from "node:fs";
import { RepositoryPatchOperation, type RepositoryPatchOperation as RepositoryPatchOperationType } from "./patch-plan.js";

export function applyPatchOperation(input: {
  readonly operation: RepositoryPatchOperationType;
  readonly current_content?: string;
}): string {
  const operation = RepositoryPatchOperation.parse(input.operation);
  const current = input.current_content ?? "";
  if (operation.kind === "create_file" || operation.kind === "full_replacement") return operation.content ?? "";
  if (operation.kind === "insert_after") return insertByAnchor(current, operation.anchor, operation.content ?? "", "after");
  if (operation.kind === "insert_before") return insertByAnchor(current, operation.anchor, operation.content ?? "", "before");
  if (operation.kind === "replace_range" && operation.start_anchor && operation.end_anchor) return replaceByAnchors(current, operation.start_anchor, operation.end_anchor, operation.content ?? "");
  if (operation.kind === "replace_range") return replaceRange(current, operation.start_line, operation.end_line, operation.content ?? "");
  if (operation.kind === "unified_diff") {
    throw new Error("Unified diff operations are validated for final patch export but not applied by the text operation applier.");
  }
  return current;
}

export function readCurrentContent(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function insertByAnchor(current: string, anchor: string | undefined, content: string, placement: "before" | "after"): string {
  if (!anchor) return placement === "after" ? `${current}${content}` : `${content}${current}`;
  assertUniqueAnchor(current, anchor);
  const index = current.indexOf(anchor);
  const offset = placement === "after" ? index + anchor.length : index;
  return `${current.slice(0, offset)}${content}${current.slice(offset)}`;
}

function replaceByAnchors(current: string, startAnchor: string, endAnchor: string, content: string): string {
  assertUniqueAnchor(current, startAnchor);
  assertUniqueAnchor(current, endAnchor);
  const start = current.indexOf(startAnchor);
  const end = current.indexOf(endAnchor, start + startAnchor.length);
  if (end < 0) throw new Error("Patch end anchor was not found after start anchor.");
  return `${current.slice(0, start)}${content}${current.slice(end + endAnchor.length)}`;
}

function replaceRange(current: string, startLine: number | undefined, endLine: number | undefined, content: string): string {
  if (!startLine || !endLine || endLine < startLine) throw new Error("replace_range requires a valid line range.");
  const lines = current.split("\n");
  lines.splice(startLine - 1, endLine - startLine + 1, ...content.replace(/\n$/, "").split("\n"));
  return lines.join("\n");
}

function assertUniqueAnchor(current: string, anchor: string): void {
  const first = current.indexOf(anchor);
  if (first < 0) throw new Error("Patch anchor was not found.");
  if (current.indexOf(anchor, first + anchor.length) >= 0) throw new Error("Patch anchor is ambiguous.");
}
