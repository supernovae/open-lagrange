import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";

export function ResearchMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const latest = [...model.conversation].reverse().find((turn) => turn.text.includes("Research "));
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Research Pack</Text>
      <Text>Fixture mode works offline. Live URL fetch requires explicit --live.</Text>
      <Text color={theme.muted}>Try /research brief "MCP security risks" or /research search "planning primitives".</Text>
      <Text color={theme.muted}>Fetch: /research fetch https://example.com --live</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Latest activity</Text>
        <Text>{latest?.text ?? "No research activity yet."}</Text>
      </Box>
    </Box>
  );
}
