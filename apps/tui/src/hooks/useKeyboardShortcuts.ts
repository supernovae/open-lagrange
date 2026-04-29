import { useInput } from "ink";
import type { PaneId } from "../types.js";

const panes: readonly PaneId[] = ["chat", "timeline", "tasks", "plan", "approvals", "diff", "verification", "review", "artifact_json", "help"];

export function nextPane(current: PaneId, direction: 1 | -1): PaneId {
  const index = panes.indexOf(current);
  const next = (index + direction + panes.length) % panes.length;
  return panes[next] ?? "chat";
}

export type ShortcutAction = "next_pane" | "previous_pane" | "help" | "quit" | "refresh" | "start_runtime" | "doctor" | "logs" | "profile" | undefined;

export function shortcutActionForInput(value: string, key: { readonly tab?: boolean; readonly shift?: boolean; readonly ctrl?: boolean; readonly escape?: boolean }): ShortcutAction {
  if (key.tab) return key.shift ? "previous_pane" : "next_pane";
  if (key.escape) return "help";
  if (!key.ctrl) return undefined;
  if (value === "c" || value === "q") return "quit";
  if (value === "r") return "refresh";
  if (value === "s") return "start_runtime";
  if (value === "d") return "doctor";
  if (value === "l") return "logs";
  if (value === "p") return "profile";
  if (value === "?") return "help";
  return undefined;
}

export function useKeyboardShortcuts(input: {
  readonly selectedPane: PaneId;
  readonly setSelectedPane: (pane: PaneId) => void;
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onRefresh: () => void;
  readonly onStartRuntime: () => void;
  readonly onDoctor: () => void;
  readonly onLogs: () => void;
  readonly onProfile: () => void;
  readonly onQuit: () => void;
}): void {
  useInput((value, key) => {
    const action = shortcutActionForInput(value, key);
    if (action === "next_pane") input.setSelectedPane(nextPane(input.selectedPane, 1));
    if (action === "previous_pane") input.setSelectedPane(nextPane(input.selectedPane, -1));
    if (action === "help") input.setSelectedPane("help");
    if (action === "quit") input.onQuit();
    if (action === "refresh") input.onRefresh();
    if (action === "start_runtime") input.onStartRuntime();
    if (action === "doctor") input.onDoctor();
    if (action === "logs") input.onLogs();
    if (action === "profile") input.onProfile();
  }, { isActive: true });
}
