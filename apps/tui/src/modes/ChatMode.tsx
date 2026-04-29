import React from "react";
import type { TuiViewModel } from "../types.js";
import { ConversationPane } from "../components/ConversationPane.js";

export function ChatMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  return <ConversationPane turns={model.conversation} scrollOffset={model.scrollOffset} />;
}
