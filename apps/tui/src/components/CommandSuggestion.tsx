import React from "react";
import { Box, Text } from "ink";
import type { SuggestedFlow } from "@open-lagrange/core/interface";
import { theme } from "../theme.js";

export function CommandSuggestion({ flow }: { readonly flow?: SuggestedFlow }): React.ReactElement | null {
  if (!flow) return null;
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={theme.accent} paddingX={1} marginTop={1}>
      <Text color={theme.title}>Suggested Flow: {flow.title}</Text>
      <Text>{flow.summary}</Text>
      <Text color={theme.accent}>{flow.command}</Text>
      <Text>Side effects: {flow.side_effects.join(", ") || "none"}</Text>
      <Text>Approval: {flow.approval}</Text>
      {flow.requires_confirmation ? <Text color={theme.warn}>Type /confirm to run, or edit the command.</Text> : null}
    </Box>
  );
}
