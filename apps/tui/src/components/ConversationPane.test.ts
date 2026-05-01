import { describe, expect, it } from "vitest";
import type { ConversationTurn } from "../types.js";
import { transcriptWindow } from "./ConversationPane.js";

describe("ConversationPane transcript window", () => {
  it("budgets visible cards by rendered line count", () => {
    const turns = [
      turn("one", "short"),
      turn("two", "line\n".repeat(30), "Help"),
      turn("three", "latest"),
    ];

    const window = transcriptWindow(turns, 12, 0);

    expect(window.cards.map((card) => card.turn.turn_id)).toEqual(["three"]);
    expect(window.hiddenOlder).toBe(2);
    expect(window.hiddenNewer).toBe(0);
  });

  it("scrolls to older cards without including newer cards", () => {
    const turns = [
      turn("one", "older"),
      turn("two", "middle"),
      turn("three", "latest"),
    ];

    const window = transcriptWindow(turns, 20, 1);

    expect(window.cards.map((card) => card.turn.turn_id)).toContain("two");
    expect(window.cards.map((card) => card.turn.turn_id)).not.toContain("three");
    expect(window.hiddenNewer).toBe(1);
  });
});

function turn(turn_id: string, text: string, title?: string): ConversationTurn {
  return {
    turn_id,
    role: "system",
    kind: "output",
    status: "completed",
    ...(title ? { title } : {}),
    text,
    created_at: "2026-05-01T00:00:00.000Z",
  };
}
