import React from "react";
import { Box, Text } from "ink";
import type { VerificationResultSummary } from "../types.js";
import { formatDuration, truncateText } from "../formatters.js";
import { theme } from "../theme.js";

export function VerificationPane({ results }: { readonly results: readonly VerificationResultSummary[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Verification</Text>
      {results.map((result) => (
        <Box key={result.command_id} flexDirection="column" marginBottom={1}>
          <Text><Text color={result.exit_code === 0 ? theme.ok : theme.error}>{result.exit_code === 0 ? "passed" : "failed"}</Text> {result.command} ({formatDuration(result.duration_ms)})</Text>
          <Text>{truncateText(result.stdout_preview || result.stderr_preview || "No output.", 600)}</Text>
          {result.truncated ? <Text color={theme.warn}>Output truncated.</Text> : null}
        </Box>
      ))}
      {results.length === 0 ? <Text color={theme.muted}>No verification recorded.</Text> : null}
    </Box>
  );
}
