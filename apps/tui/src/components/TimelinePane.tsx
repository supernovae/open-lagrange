import React from "react";
import { Box, Text } from "ink";
import type { ReconciliationTimelineItem } from "../types.js";
import { theme } from "../theme.js";

export function TimelinePane({ items }: { readonly items: readonly ReconciliationTimelineItem[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Reconciliation Timeline</Text>
      {items.slice(-14).map((item) => (
        <Text key={item.event_id}>
          <Text color={color(item.severity)}>{item.phase}</Text>
          {" "}
          {item.title}: {item.summary}
        </Text>
      ))}
      {items.length === 0 ? <Text color={theme.muted}>No timeline events yet.</Text> : null}
    </Box>
  );
}

function color(severity: ReconciliationTimelineItem["severity"]): string {
  if (severity === "success") return theme.ok;
  if (severity === "warning") return theme.warn;
  if (severity === "error") return theme.error;
  return theme.muted;
}
