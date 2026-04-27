import { describe, expect, it } from "vitest";
import { nextPane } from "./useKeyboardShortcuts.js";

describe("pane selection", () => {
  it("cycles forward and backward through panes", () => {
    expect(nextPane("chat", 1)).toBe("timeline");
    expect(nextPane("chat", -1)).toBe("help");
  });
});
