import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";
import { SuggestedFlows } from "../components/SuggestedFlows.js";
import { CommandSuggestion } from "../components/CommandSuggestion.js";

export function HomeMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const unhealthy = (model.health.pack_health ?? []).filter((pack) => pack.status !== "healthy").length;
  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor={theme.border} paddingX={1} flexDirection="column">
        <Text color={theme.title}>Runtime</Text>
        <Text>API {model.health.api}  Worker {model.health.worker}  Model {model.health.model}</Text>
        <Text>Packs {model.health.packs}  Pack health {unhealthy === 0 ? "healthy" : `${unhealthy} issue(s)`}  Approvals {model.approvals.length}  Artifacts {model.artifacts.length}</Text>
      </Box>
      <Box borderStyle="single" borderColor={theme.border} paddingX={1} marginTop={1} flexDirection="column">
        <Text color={theme.title}>Starter Flows</Text>
        <SuggestedFlows />
      </Box>
      {model.pendingFlow ? <CommandSuggestion flow={model.pendingFlow} /> : null}
      <Box borderStyle="single" borderColor={theme.border} paddingX={1} marginTop={1} flexDirection="column">
        <Text color={theme.title}>Recent Artifacts</Text>
        {model.artifacts.slice(-4).map((artifact) => <Text key={artifact.artifact_id}>• {artifact.title}</Text>)}
        {model.artifacts.length === 0 ? <Text>No artifacts indexed yet.</Text> : null}
      </Box>
    </Box>
  );
}
