import React from "react";
import { Box, Text } from "ink";
import type { RunSnapshot } from "@open-lagrange/core/runs";
import { theme } from "../../theme.js";

export function RunApprovalPane({ run }: { readonly run: RunSnapshot | undefined }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Approvals</Text>
      {(run?.approvals ?? []).map((approval) => (
        <Text key={approval.approval_id} {...(approval.status === "requested" ? { color: theme.warn } : {})}>{approval.status}: {approval.title} ({approval.approval_id})</Text>
      ))}
      {run?.approvals.length === 0 ? <Text color={theme.muted}>No approvals recorded.</Text> : null}
    </Box>
  );
}
