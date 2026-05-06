import { describe, expect, it } from "vitest";
import { parseEditorCommand } from "./editor-command.js";

describe("editor command parsing", () => {
  it("defaults to vi when no editor is configured", () => {
    expect(parseEditorCommand(undefined)).toEqual(["vi"]);
    expect(parseEditorCommand("   ")).toEqual(["vi"]);
  });

  it("splits editor arguments without invoking a shell", () => {
    expect(parseEditorCommand("code --wait")).toEqual(["code", "--wait"]);
    expect(parseEditorCommand("vim -c 'set ft=markdown'")).toEqual(["vim", "-c", "set ft=markdown"]);
    expect(parseEditorCommand("emacsclient --alternate-editor= -c")).toEqual(["emacsclient", "--alternate-editor=", "-c"]);
  });

  it("rejects unterminated quoted editor commands", () => {
    expect(() => parseEditorCommand("code --wait \"unterminated")).toThrow(/unterminated/);
  });
});
