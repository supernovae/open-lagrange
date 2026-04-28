import React from "react";
import { Box, Text } from "ink";
import type { RuntimeHealth } from "@open-lagrange/core/interface";
import { theme } from "../theme.js";

export function StatusBar({ health }: { readonly health: RuntimeHealth }): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
      <Text color={theme.title}>Profile:</Text><Text> {health.profile}  </Text>
      <Text color={color(health.api)}>API:</Text><Text> {health.api}  </Text>
      <Text color={color(health.worker)}>Worker:</Text><Text> {health.worker}  </Text>
      <Text color={color(health.hatchet)}>Hatchet:</Text><Text> {health.hatchet}  </Text>
      <Text color={theme.title}>Packs:</Text><Text> {health.packs}  </Text>
      <Text color={health.model === "configured" ? theme.ok : theme.warn}>Model:</Text><Text> {health.model}  </Text>
      <Text color={health.remote_auth === "configured" ? theme.ok : theme.warn}>Auth:</Text><Text> {health.remote_auth ?? "missing"}  </Text>
      <Text color={theme.title}>Secrets:</Text><Text> {health.secret_provider ?? "env"}</Text>
    </Box>
  );
}

function color(value: string): string {
  if (value === "up" || value === "local") return theme.ok;
  if (value === "down") return theme.error;
  return theme.warn;
}
