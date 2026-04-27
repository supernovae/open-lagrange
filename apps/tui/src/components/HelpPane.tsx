import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

export function HelpPane(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Help</Text>
      <Text>tab / shift+tab: cycle pane</Text>
      <Text>r refresh   q quit   ? help</Text>
      <Text>a approve   x reject</Text>
      <Text>d diff      v verification</Text>
      <Text>j JSON      p plan</Text>
      <Text>/run &lt;goal&gt;       /attach &lt;project_id&gt;</Text>
      <Text>/approve &lt;reason&gt;  /reject &lt;reason&gt;</Text>
      <Text>/diff /verify /review /json /status</Text>
    </Box>
  );
}
