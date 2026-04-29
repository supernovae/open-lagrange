import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { RuntimeStatusStrip } from "../components/RuntimeStatusStrip.js";
import { theme } from "../theme.js";

export function DoctorMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Doctor</Text>
      <RuntimeStatusStrip health={model.health} />
      <Text>Run /doctor to refresh runtime checks.</Text>
      {model.lastError ? <Text color={theme.error}>{model.lastError}</Text> : null}
    </Box>
  );
}
