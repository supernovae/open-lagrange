import React from "react";
import type { TuiViewModel } from "../types.js";
import { PackBuilderPane } from "../components/PackBuilderPane.js";

export function PackMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  return <PackBuilderPane model={model} />;
}
