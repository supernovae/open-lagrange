import { describe, expect, it } from "vitest";
import { formatDuration, formatJson, paneTitle, statusColor, truncateText } from "./formatters.js";

describe("TUI formatters", () => {
  it("truncates long text with a visible notice", () => {
    const formatted = truncateText("abcdef", 3);

    expect(formatted).toContain("abc");
    expect(formatted).toContain("[truncated 3 chars]");
  });

  it("pretty-prints and truncates JSON artifacts", () => {
    const formatted = formatJson({ status: "completed", values: [1, 2, 3] }, 24);

    expect(formatted).toContain('"status"');
    expect(formatted).toContain("[truncated");
  });

  it("formats durations for compact terminal display", () => {
    expect(formatDuration(900)).toBe("900ms");
    expect(formatDuration(1200)).toBe("1.2s");
  });

  it("maps pane and status labels", () => {
    expect(paneTitle("artifact_json")).toBe("artifact json");
    expect(statusColor("completed")).toBe("green");
    expect(statusColor("requires_approval")).toBe("yellow");
    expect(statusColor("failed")).toBe("red");
  });
});
