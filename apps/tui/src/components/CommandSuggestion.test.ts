import React from "react";
import { describe, expect, it } from "vitest";
import { flowForRepositoryPlan } from "@open-lagrange/core/interface";
import { CommandSuggestion } from "./CommandSuggestion.js";

describe("CommandSuggestion", () => {
  it("renders a valid suggestion element", () => {
    const element = React.createElement(CommandSuggestion, { flow: flowForRepositoryPlan("add json output") });

    expect(React.isValidElement(element)).toBe(true);
  });
});
