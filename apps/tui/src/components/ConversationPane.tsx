import React from "react";
import { Box, Text } from "ink";
import type { ConversationTurn } from "../types.js";
import { truncateText } from "../formatters.js";
import { theme } from "../theme.js";

export function ConversationPane({ turns, height = 18, scrollOffset = 0, expandedTurnId }: {
  readonly turns: readonly ConversationTurn[];
  readonly height?: number;
  readonly scrollOffset?: number;
  readonly expandedTurnId?: string | undefined;
}): React.ReactElement {
  const expandedTurn = expandedTurnId ? turns.find((turn) => turn.turn_id === expandedTurnId) : undefined;
  if (expandedTurn) return <ExpandedTurn turn={expandedTurn} height={height} lineOffset={scrollOffset} />;
  const window = transcriptWindow(turns, height, scrollOffset);
  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      <Text color={theme.title}>
        Transcript
        {turns.length > window.cards.length ? <Text color={theme.muted}> {window.start + 1}-{window.end} / {turns.length}</Text> : null}
        {scrollOffset > 0 ? <Text color={theme.warn}> scrolled</Text> : null}
      </Text>
      {window.hiddenOlder > 0 ? <Text color={theme.muted}>... {window.hiddenOlder} older card(s); PgUp to scroll back.</Text> : null}
      {window.cards.map((card) => <TurnCard key={card.turn.turn_id} turn={card.turn} maxBodyLines={card.maxBodyLines} />)}
      {window.hiddenNewer > 0 ? <Text color={theme.muted}>... {window.hiddenNewer} newer card(s); PgDn to return.</Text> : null}
      {turns.length === 0 ? <Text color={theme.muted}>No messages yet.</Text> : null}
    </Box>
  );
}

export interface TranscriptWindowCard {
  readonly turn: ConversationTurn;
  readonly maxBodyLines: number;
}

export interface TranscriptWindow {
  readonly cards: readonly TranscriptWindowCard[];
  readonly start: number;
  readonly end: number;
  readonly hiddenOlder: number;
  readonly hiddenNewer: number;
}

export function transcriptWindow(turns: readonly ConversationTurn[], height: number, scrollOffset = 0): TranscriptWindow {
  const end = Math.max(0, turns.length - Math.max(0, scrollOffset));
  const cards: TranscriptWindowCard[] = [];
  let remainingRows = Math.max(1, height - 2);
  let start = end;
  for (let index = end - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn) continue;
    const lineCount = turnLineCount(turn);
    const defaultMax = defaultMaxBodyLines(turn);
    const maxUsefulBodyLines = Math.max(1, Math.min(defaultMax, lineCount));
    const overheadRows = 4;
    let bodyLines = Math.max(1, Math.min(maxUsefulBodyLines, remainingRows - overheadRows));
    let estimatedRows = estimatedCardRows(turn, bodyLines);
    while (estimatedRows > remainingRows && bodyLines > 1) {
      bodyLines -= 1;
      estimatedRows = estimatedCardRows(turn, bodyLines);
    }
    if (estimatedRows > remainingRows && cards.length > 0) break;
    cards.push({ turn, maxBodyLines: bodyLines });
    remainingRows = Math.max(0, remainingRows - estimatedRows);
    start = index;
    if (remainingRows <= 0) break;
  }
  return {
    cards: cards.reverse(),
    start,
    end,
    hiddenOlder: start,
    hiddenNewer: turns.length - end,
  };
}

function TurnCard({ turn, maxBodyLines }: { readonly turn: ConversationTurn; readonly maxBodyLines: number }): React.ReactElement {
  const lines = truncateText(turn.text, 2400).split("\n");
  const shown = lines.slice(0, maxBodyLines);
  const hidden = Math.max(0, lines.length - shown.length);
  return (
    <Box borderStyle={turn.kind === "error" ? "round" : "single"} borderColor={turnColor(turn)} paddingX={1} marginTop={1} flexDirection="column" flexShrink={0}>
      <Text color={turnColor(turn)}>
        {turnLabel(turn)}
        {turn.title ? <Text color={theme.muted}> · {turn.title}</Text> : null}
      </Text>
      {shown.map((line, index) => (
        <Text key={`${turn.turn_id}:${index}`} wrap="truncate-end">{line}</Text>
      ))}
      {hidden > 0 ? <Text color={theme.muted}>... {hidden} more line(s) in this card. Type /expand to view.</Text> : null}
    </Box>
  );
}

function ExpandedTurn({ turn, height, lineOffset }: { readonly turn: ConversationTurn; readonly height: number; readonly lineOffset: number }): React.ReactElement {
  const lines = truncateText(turn.text, 20_000).split("\n");
  const visibleRows = Math.max(1, height - 5);
  const maxStart = Math.max(0, lines.length - visibleRows);
  const start = Math.max(0, Math.min(lineOffset, maxStart));
  const shown = lines.slice(start, start + visibleRows);
  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      <Text color={turnColor(turn)}>
        Expanded {turnLabel(turn)}
        {turn.title ? <Text color={theme.muted}> · {turn.title}</Text> : null}
        <Text color={theme.muted}> {start + 1}-{Math.min(lines.length, start + shown.length)} / {lines.length}</Text>
      </Text>
      <Text color={theme.muted}>PgUp/PgDn scroll output. Type /collapse to return to transcript.</Text>
      <Box borderStyle={turn.kind === "error" ? "round" : "single"} borderColor={turnColor(turn)} paddingX={1} marginTop={1} flexDirection="column" flexShrink={0}>
        {shown.map((line, index) => (
          <Text key={`${turn.turn_id}:expanded:${start + index}`} wrap="truncate-end">{line}</Text>
        ))}
      </Box>
    </Box>
  );
}

function defaultMaxBodyLines(turn: ConversationTurn): number {
  return turn.kind === "output" && turn.title === "Help" ? 28 : 8;
}

function turnLineCount(turn: ConversationTurn): number {
  return truncateText(turn.text, 2400).split("\n").length;
}

function estimatedCardRows(turn: ConversationTurn, bodyLines: number): number {
  const hiddenLine = turnLineCount(turn) > bodyLines ? 1 : 0;
  return 4 + bodyLines + hiddenLine;
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
