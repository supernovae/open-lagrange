import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

export function HelpPane(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Help</Text>
      <Text>Plain text submits a new goal or refines the active project.</Text>
      <Text>Commands start with /. Normal letters are never shortcuts.</Text>
      <Text>tab / shift+tab: cycle pane</Text>
      <Text>ctrl+r refresh   ctrl+q quit   esc help</Text>
      <Text>ctrl+s start runtime   ctrl+d doctor   ctrl+l logs</Text>
      <Text>/run &lt;goal&gt;       /attach &lt;project_id&gt;</Text>
      <Text>/approve &lt;reason&gt;  /reject &lt;reason&gt;</Text>
      <Text>/diff /verify /review /json /status</Text>
    </Box>
  );
}
