import React from "react";
import { Box, Text, useWindowSize } from "ink";
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
  const { columns, rows } = useWindowSize();
  const width = Math.max(40, columns);
  const height = Math.max(14, rows);
  const compact = width < 82;
  const mainHeight = Math.max(4, height - 7);
  return (
    <Box flexDirection="column" width={width} height={height}>
      <StatusBar health={model.health} width={width} />
      <Box flexDirection={compact ? "column" : "row"} width={width} height={mainHeight} flexGrow={1}>
        {compact ? null : <Sidebar model={model} width={Math.min(34, Math.max(28, Math.floor(width * 0.34)))} height={mainHeight} />}
        <DetailPane model={model} height={mainHeight} />
      </Box>
      <InputBar value={input} onChange={setInput} onSubmit={onSubmit} placeholder="Type a goal or message. ↑/↓ history, PgUp/PgDn scroll." width={width} />
    </Box>
  );
}
