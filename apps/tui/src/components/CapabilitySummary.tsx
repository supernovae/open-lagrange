import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";

export function CapabilitySummary({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const unhealthy = (model.health.pack_health ?? []).filter((pack) => pack.status !== "healthy").length;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.title}>Capabilities</Text>
      <Text>Packs: {model.health.packs}</Text>
      <Text>Pack health: {unhealthy === 0 ? "healthy" : `${unhealthy} issue(s)`}</Text>
      <Text>Approvals waiting: {model.approvals.length}</Text>
      <Text>Recent artifacts: {model.artifacts.length}</Text>
    </Box>
  );
}
