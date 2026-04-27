import { useInput } from "ink";
import type { PaneId } from "../types.js";

const panes: readonly PaneId[] = ["chat", "timeline", "tasks", "approvals", "diff", "verification", "review", "artifact_json", "help"];

export function nextPane(current: PaneId, direction: 1 | -1): PaneId {
  const index = panes.indexOf(current);
  const next = (index + direction + panes.length) % panes.length;
  return panes[next] ?? "chat";
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
    if (key.tab) input.setSelectedPane(nextPane(input.selectedPane, key.shift ? -1 : 1));
    if (value === "?") input.setSelectedPane("help");
    if (value === "q") input.onQuit();
    if (value === "r") input.onRefresh();
    if (value === "s") input.onStartRuntime();
    if (value === "d") input.onDoctor();
    if (value === "l") input.onLogs();
    if (value === "p") input.onProfile();
    if (value === "a") input.onApprove();
    if (value === "x" || value === "R") input.onReject();
    if (value === "v") input.setSelectedPane("verification");
    if (value === "o") input.setSelectedPane("timeline");
    if (value === "e") input.setSelectedPane("timeline");
    if (value === "j") input.setSelectedPane("artifact_json");
  }, { isActive: true });
}
