import { describe, expect, it } from "vitest";
import { nextPane, shortcutActionForInput } from "./useKeyboardShortcuts.js";

describe("pane selection", () => {
  it("cycles forward and backward through panes", () => {
    expect(nextPane("chat", 1)).toBe("timeline");
    expect(nextPane("chat", -1)).toBe("home");
  });

  it("does not treat normal typing as a shortcut", () => {
    expect(shortcutActionForInput("a", {})).toBeUndefined();
    expect(shortcutActionForInput("w", {})).toBeUndefined();
  });

  it("keeps runtime controls behind modifiers", () => {
    expect(shortcutActionForInput("r", { ctrl: true })).toBe("refresh");
    expect(shortcutActionForInput("q", { ctrl: true })).toBe("quit");
    expect(shortcutActionForInput("", { tab: true })).toBe("next_pane");
    expect(shortcutActionForInput("", { tab: true, shift: true })).toBe("previous_pane");
  });
});
