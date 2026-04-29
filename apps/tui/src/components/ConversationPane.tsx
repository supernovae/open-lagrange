import React from "react";
import { Box, Text } from "ink";
import type { ConversationTurn } from "../types.js";
import { truncateText } from "../formatters.js";
import { theme } from "../theme.js";

export function ConversationPane({ turns, height = 18, scrollOffset = 0 }: {
  readonly turns: readonly ConversationTurn[];
  readonly height?: number;
  readonly scrollOffset?: number;
}): React.ReactElement {
  const visibleCount = Math.max(1, Math.floor((height - 2) / 5));
  const end = Math.max(0, turns.length - scrollOffset);
  const start = Math.max(0, end - visibleCount);
  const visible = turns.slice(start, end);
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>
        Transcript
        {turns.length > visible.length ? <Text color={theme.muted}> {start + 1}-{end} / {turns.length}</Text> : null}
        {scrollOffset > 0 ? <Text color={theme.warn}> scrolled</Text> : null}
      </Text>
      {visible.map((turn) => <TurnCard key={turn.turn_id} turn={turn} />)}
      {turns.length === 0 ? <Text color={theme.muted}>No messages yet.</Text> : null}
    </Box>
  );
}

function TurnCard({ turn }: { readonly turn: ConversationTurn }): React.ReactElement {
  const lines = truncateText(turn.text, 2400).split("\n");
  const maxLines = turn.kind === "output" && turn.title === "Help" ? 28 : 8;
  const shown = lines.slice(0, maxLines);
  const hidden = Math.max(0, lines.length - shown.length);
  return (
    <Box borderStyle={turn.kind === "error" ? "round" : "single"} borderColor={turnColor(turn)} paddingX={1} marginTop={1} flexDirection="column" flexShrink={0}>
      <Text color={turnColor(turn)}>
        {turnLabel(turn)}
        {turn.title ? <Text color={theme.muted}> · {turn.title}</Text> : null}
      </Text>
      {shown.map((line, index) => (
        <Text key={`${turn.turn_id}:${index}`}>{line}</Text>
      ))}
      {hidden > 0 ? <Text color={theme.muted}>... {hidden} more line(s); PgUp/PgDn to scroll older cards.</Text> : null}
    </Box>
  );
}

function turnLabel(turn: ConversationTurn): string {
  if (turn.kind === "command") return "command";
  if (turn.kind === "suggestion") return "suggestion";
  if (turn.kind === "output") {
    if (turn.status === "pending") return "running";
    return turn.status === "failed" ? "failed output" : "output";
  }
  if (turn.kind === "error") return "error";
  if (turn.kind === "copy") return "copy view";
  return turn.role === "user" ? "you" : "system";
}

function turnColor(turn: ConversationTurn): string {
  if (turn.kind === "error" || turn.status === "failed") return theme.error;
  if (turn.status === "pending") return theme.warn;
  if (turn.kind === "command") return theme.accent;
  if (turn.kind === "suggestion") return theme.warn;
  if (turn.kind === "output") return theme.ok;
  if (turn.kind === "copy") return theme.title;
  return turn.role === "user" ? theme.accent : theme.muted;
}
