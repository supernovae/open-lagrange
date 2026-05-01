import { describe, expect, it } from "vitest";
import { commandGroups, groupedHelpText } from "./help-taxonomy.js";

describe("CLI command taxonomy", () => {
  it("groups commands around the primary product objects", () => {
    const help = groupedHelpText();

    expect(commandGroups.map((group) => group.title)).toEqual([
      "Core Runtime",
      "Primary Work",
      "Configuration",
      "Domain Shortcuts",
      "Advanced/Dev",
    ]);
    expect(help).toContain("plan  run  artifact  pack");
    expect(help).toContain("repo  research  skill");
    expect(help).toContain("Planfiles are the primary reusable surface");
  });
});
