import React from "react";
import { Box, Text } from "ink";
import type { RunSnapshot } from "@open-lagrange/core/runs";
import { theme } from "../../theme.js";

export function RunModelCallsPane({ run }: { readonly run: RunSnapshot | undefined }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Model Calls</Text>
      {(run?.model_calls ?? []).map((call) => <Text key={call.artifact_id}>{call.title}: {call.summary}</Text>)}
      {run?.model_calls.length === 0 ? <Text color={theme.muted}>No model calls recorded.</Text> : null}
    </Box>
  );
}
