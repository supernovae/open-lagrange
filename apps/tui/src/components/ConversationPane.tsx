import React from "react";
import { Box, Text } from "ink";
import type { ConversationTurn } from "../types.js";
import { truncateText } from "../formatters.js";
import { theme } from "../theme.js";

export function ConversationPane({ turns }: { readonly turns: readonly ConversationTurn[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Conversation</Text>
      {turns.slice(-8).map((turn) => (
        <Text key={turn.turn_id}>
          <Text color={turn.role === "user" ? theme.accent : theme.muted}>{turn.role}</Text>
          {": "}
          {truncateText(turn.text, 220)}
        </Text>
      ))}
    </Box>
  );
}
