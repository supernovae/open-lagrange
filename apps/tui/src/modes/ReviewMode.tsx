import React from "react";
import type { TuiViewModel } from "../types.js";
import { ReviewPane } from "../components/ReviewPane.js";

export function ReviewMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  return <ReviewPane model={model} />;
}
