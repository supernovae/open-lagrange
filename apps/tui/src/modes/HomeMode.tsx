import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";
import { RuntimeStatusStrip } from "../components/RuntimeStatusStrip.js";
import { CapabilitySummary } from "../components/CapabilitySummary.js";
import { SuggestedFlows } from "../components/SuggestedFlows.js";
import { CommandSuggestion } from "../components/CommandSuggestion.js";

export function HomeMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Home</Text>
      <RuntimeStatusStrip health={model.health} />
      <CapabilitySummary model={model} />
      <SuggestedFlows />
      {model.pendingFlow ? <CommandSuggestion flow={model.pendingFlow} /> : null}
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.title}>Recent Artifacts</Text>
        {model.artifacts.slice(-4).map((artifact) => <Text key={artifact.artifact_id}>• {artifact.title}</Text>)}
        {model.artifacts.length === 0 ? <Text>No artifacts indexed yet.</Text> : null}
      </Box>
    </Box>
  );
}
