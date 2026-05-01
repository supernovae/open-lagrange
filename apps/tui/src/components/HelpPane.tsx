import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

export function HelpPane(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Help</Text>
      <Text>Plain text suggests a typed flow. Use /confirm before work starts.</Text>
      <Text>Commands start with /. Normal letters are never shortcuts.</Text>
      <Text>up/down: command history   page up/down: transcript scroll</Text>
      <Text>ctrl+e or /expand: open current card   /collapse: return</Text>
      <Text>shift+up/down: transcript scroll   /copy: render current view text</Text>
      <Text>tab / shift+tab: cycle pane</Text>
      <Text>ctrl+r refresh   ctrl+q quit   esc help</Text>
      <Text>ctrl+s start runtime   ctrl+d doctor   ctrl+l logs</Text>
      <Text>/compose &lt;goal&gt;  /check &lt;planfile&gt;  /library</Text>
      <Text>/run list  /run outputs latest  /artifacts</Text>
      <Text>/providers /packs /schedule</Text>
      <Text>/plan repo &lt;goal&gt;  /repo run &lt;goal&gt;</Text>
      <Text>/skill plan &lt;file&gt; /pack build &lt;file&gt;</Text>
      <Text>/demo run repo-json-output --live</Text>
      <Text>/artifact recent</Text>
      <Text>/artifact show &lt;id&gt; /approve &lt;id&gt; /reject &lt;id&gt;</Text>
      <Text>/status /doctor /capabilities /packs /demos</Text>
    </Box>
  );
}
