import React from "react";
import { Box, Text } from "ink";
import type { RunSnapshot } from "@open-lagrange/core/runs";
import { theme } from "../../theme.js";

export function RunTimelinePane({ run }: { readonly run: RunSnapshot | undefined }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Timeline</Text>
      {(run?.timeline ?? []).slice(-14).map((item) => (
        <Text key={item.event_id} {...(item.severity === "error" ? { color: theme.error } : item.severity === "warning" ? { color: theme.warn } : item.severity === "success" ? { color: theme.ok } : {})}>
          {item.timestamp.slice(11, 19)} {item.type} {item.node_id ? `(${item.node_id})` : ""} {item.summary}
        </Text>
      ))}
      {run?.timeline.length === 0 ? <Text color={theme.muted}>No events recorded.</Text> : null}
    </Box>
  );
}
