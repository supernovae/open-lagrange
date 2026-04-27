import React from "react";
import { Box, Text } from "ink";
import type { ApprovalRequestSummary } from "../types.js";
import { theme } from "../theme.js";

export function ApprovalPane({ approvals }: { readonly approvals: readonly ApprovalRequestSummary[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Approvals</Text>
      {approvals.map((approval) => (
        <Box key={approval.approval_request_id} flexDirection="column" marginBottom={1}>
          <Text>{approval.requested_capability} <Text color={theme.warn}>{approval.requested_risk_level}</Text></Text>
          <Text>Task: {approval.task_id}</Text>
          <Text>{approval.prompt}</Text>
        </Box>
      ))}
      {approvals.length === 0 ? <Text color={theme.muted}>No approvals waiting.</Text> : null}
    </Box>
  );
}
