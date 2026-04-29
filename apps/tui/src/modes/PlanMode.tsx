import React from "react";
import type { TuiViewModel } from "../types.js";
import { PlanPane } from "../components/PlanPane.js";

export function PlanMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  return <PlanPane model={model} />;
}
