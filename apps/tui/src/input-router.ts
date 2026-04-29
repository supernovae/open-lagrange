import { routeIntent, type SuggestedFlow } from "@open-lagrange/core/interface";
import { parseSlashCommand, type SlashCommandContext } from "./slash-commands.js";
import type { ParsedInput } from "./types.js";

export interface InputRouterContext extends SlashCommandContext {
  readonly project_id?: string;
  readonly task_id?: string;
}

export function routeTuiInput(text: string, context: InputRouterContext = {}): ParsedInput {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "empty" };
  if (trimmed.startsWith("/")) {
    const parsed = parseSlashCommand(trimmed, context);
    if (parsed.kind === "quit") return { kind: "command", command: parsed.command, quit: true };
    if (parsed.kind === "pane") return { kind: "command", command: parsed.command, pane: parsed.pane };
    if (parsed.kind === "error") return { kind: "command", command: parsed.command, error: parsed.error };
    if (parsed.kind === "confirm") return { kind: "command", command: parsed.command, event: parsed.event };
    return { kind: "command", command: parsed.command, ...(parsed.pane ? { pane: parsed.pane } : {}), event: parsed.event };
  }

  const routed = routeIntent({ text: trimmed, context });
  if (routed.kind === "flow" && routed.flow) {
    if (!routed.flow.requires_confirmation) return { kind: "event", event: routed.flow.event };
    return { kind: "suggestion", flow: routed.flow, ...(routed.message ? { message: routed.message } : {}) };
  }
  if (routed.kind === "multiple") return { kind: "suggestions", flows: routed.alternatives ?? [], message: routed.message ?? "Multiple flows matched." };
  return { kind: "event", event: { type: "chat.message", text: trimmed } };
}

export function suggestionText(flow: SuggestedFlow): string {
  return [
    `Suggested flow: ${flow.title}`,
    `Command: ${flow.command}`,
    `Side effects: ${flow.side_effects.join(", ") || "none"}`,
    `Approval: ${flow.approval}`,
    "Type /confirm to run this suggestion, or edit the command above.",
  ].join("\n");
}
