import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";

export function ReviewPane({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const review = model.activeTask?.repository_status?.review_report;
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Review Report</Text>
      {review ? (
        <>
          <Text>{review.pr_title}</Text>
          <Text>{review.pr_summary}</Text>
          <Text color={theme.title}>Tests</Text>
          {review.test_notes.map((note) => <Text key={note}>- {note}</Text>)}
          <Text color={theme.title}>Risk</Text>
          {review.risk_notes.map((note) => <Text key={note}>- {note}</Text>)}
          <Text color={theme.title}>Follow-up</Text>
          {review.follow_up_notes.map((note) => <Text key={note}>- {note}</Text>)}
        </>
      ) : <Text color={theme.muted}>No review report recorded.</Text>}
    </Box>
  );
}
