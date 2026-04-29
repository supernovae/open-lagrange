import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { TimelinePane } from "../components/TimelinePane.js";
import { theme } from "../theme.js";

export function RunMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Run</Text>
      <TimelinePane items={model.timeline} />
    </Box>
  );
}
