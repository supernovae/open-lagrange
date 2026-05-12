import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { RunArtifactPane } from "../components/runs/RunArtifactPane.js";
import { RunApprovalPane } from "../components/runs/RunApprovalPane.js";
import { RunDetailPane } from "../components/runs/RunDetailPane.js";
import { RunFrame } from "../components/runs/RunFrame.js";
import { RunModelCallsPane } from "../components/runs/RunModelCallsPane.js";
import { RunOutputPane } from "../components/runs/RunOutputPane.js";
import { RunTimelinePane } from "../components/runs/RunTimelinePane.js";
import { theme } from "../theme.js";

export function RunConsoleMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const run = model.run;
  const object = model.activeObject;
  return (
    <Box flexDirection="row" columnGap={2}>
      <Box flexDirection="column" width="34%">
        <RunFrame run={run} {...(model.runConnectionState ? { connectionState: model.runConnectionState } : {})} />
      </Box>
      <Box flexDirection="column" width="40%">
        {object?.type === "artifact" ? <RunArtifactPane run={run} /> : null}
        {object?.type === "approval" ? <RunApprovalPane run={run} /> : null}
        {object?.type === "model_call" ? <RunModelCallsPane run={run} /> : null}
        {object?.type === "output" ? <RunOutputPane run={run} /> : null}
        {object?.type === "logs" ? <RunLogs run={run} /> : null}
        {object?.type === "plan" ? <RunPlan run={run} /> : null}
        {!object || object.type === "node" ? <RunTimelinePane run={run} /> : null}
      </Box>
      <Box flexDirection="column" width="26%">
        <RunDetailPane run={run} />
      </Box>
    </Box>
  );
}

function RunLogs({ run }: { readonly run: TuiViewModel["run"] }): React.ReactElement {
  return <Box flexDirection="column"><Text color={theme.title}>Logs</Text>{(run?.errors ?? []).map((error, index) => <Text key={`${error.code}:${index}`} color={theme.error}>{error.message}</Text>)}{(run?.policy_reports ?? []).map((policy) => <Text key={`${policy.capability_ref}:${policy.created_at}`}>{policy.decision}: {policy.reason}</Text>)}</Box>;
}

function RunPlan({ run }: { readonly run: TuiViewModel["run"] }): React.ReactElement {
  return <Box flexDirection="column"><Text color={theme.title}>Plan</Text><Text>{run?.plan_markdown?.slice(0, 2200) ?? "No Planfile projection recorded."}</Text></Box>;
}
