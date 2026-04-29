import React from "react";
import { Box, Text } from "ink";
import type { RuntimeHealth } from "@open-lagrange/core/interface";
import { theme } from "../theme.js";

export function RuntimeStatusStrip({ health }: { readonly health: RuntimeHealth }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={2}>
      <Text><Text color={theme.title}>Profile</Text> {health.profile}</Text>
      <Text><Text color={theme.title}>API</Text> {health.api}</Text>
      <Text><Text color={theme.title}>Worker</Text> {health.worker}</Text>
      <Text><Text color={theme.title}>Model</Text> {health.model}</Text>
    </Box>
  );
}
