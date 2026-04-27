import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { StatusBar } from "./StatusBar.js";
import { Sidebar } from "./Sidebar.js";
import { DetailPane } from "./DetailPane.js";
import { InputBar } from "./InputBar.js";
import { theme } from "../theme.js";

export function Layout({ model, input, setInput, onSubmit }: {
  readonly model: TuiViewModel;
  readonly input: string;
  readonly setInput: (value: string) => void;
  readonly onSubmit: (value: string) => void;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <StatusBar health={model.health} />
      {model.lastError ? <Text color={theme.error}>{model.lastError}</Text> : null}
      <Box>
        <Sidebar model={model} />
        <DetailPane model={model} />
      </Box>
      <InputBar value={input} onChange={setInput} onSubmit={onSubmit} placeholder="ask, refine, approve, reject, explain, show diff" />
    </Box>
  );
}
