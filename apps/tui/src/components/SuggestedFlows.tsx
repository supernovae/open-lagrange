import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

const flows = [
  '/plan repo "add json output to my cli"',
  "/pack build ./skills.md",
  "/demo run repo-json-output",
  "/doctor",
];

export function SuggestedFlows(): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.title}>Starter Flows</Text>
      {flows.map((flow) => <Text key={flow}>• {flow}</Text>)}
    </Box>
  );
}
