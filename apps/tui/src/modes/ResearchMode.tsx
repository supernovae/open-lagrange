import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";

export function ResearchMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const latest = [...model.conversation].reverse().find((turn) => turn.text.includes("Research "));
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Research Pack</Text>
      <Text>Live fetch is default. Fixture mode is explicit and labeled.</Text>
      <Text color={theme.muted}>Try /research summarize-url https://example.com or /research brief "MCP security risks" --url https://example.com.</Text>
      <Text color={theme.muted}>Fixture demo: /research brief "MCP security risks" --fixture</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Latest activity</Text>
        <Text>{latest?.text ?? "No research activity yet."}</Text>
      </Box>
    </Box>
  );
}
