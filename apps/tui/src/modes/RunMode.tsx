import React from "react";
import type { TuiViewModel } from "../types.js";
import { RunConsoleMode } from "./RunConsoleMode.js";

export function RunMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  return <RunConsoleMode model={model} />;
}
