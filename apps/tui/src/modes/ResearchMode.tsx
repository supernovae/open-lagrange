import React from "react";
import { Box, Text } from "ink";
import { buildResearchRunView } from "@open-lagrange/core/research";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";

export function ResearchMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const latest = [...model.conversation].reverse().find((turn) => turn.text.includes("Research "));
  const research = model.run ? buildResearchRunView({ snapshot: model.run }) : undefined;
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text color={theme.title}>Research Workbench</Text>
        <Text color={theme.muted}>s sources  b brief  c citations  a artifacts  p plan  e export  r rerun  S schedule  q back</Text>
      </Box>
      {research ? (
        <Box flexDirection="column">
          <Text>{research.topic}</Text>
          <Text>Status: {research.status} | mode: {research.execution_mode} | phase: {research.current_phase ?? "waiting"}</Text>
          <Text>Sources: {research.source_counts.found} found, {research.source_counts.selected} selected, {research.source_counts.rejected} rejected, {research.source_counts.extracted} extracted</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.title}>Sources</Text>
            {research.sources.slice(0, 8).map((source) => (
              <Text key={source.source_id}>
                {source.selected ? "[selected]" : source.rejected ? "[rejected]" : "[found]"} {source.title} {source.domain ? `(${source.domain})` : ""}{source.selection_reason ? ` - ${source.selection_reason}` : ""}
              </Text>
            ))}
            {research.sources.length === 0 ? <Text color={theme.muted}>No sources have been indexed for this run yet.</Text> : null}
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.title}>Brief</Text>
            <Text>{research.brief ? `${research.brief.title} (${research.brief.citation_count} citation(s), ${research.brief.artifact_id})` : "Brief not available yet."}</Text>
          </Box>
          {research.next_actions.length > 0 ? (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.title}>Next Actions</Text>
              {research.next_actions.map((action) => <Text key={action.action_id}>{action.label}{action.command ? `: ${action.command}` : ""}</Text>)}
            </Box>
          ) : null}
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text>Start from a prompt with /research brief "topic" or /research summarize-url https://example.com.</Text>
          <Text color={theme.muted}>Provider setup: /research providers</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.title}>Latest activity</Text>
            <Text>{latest?.text ?? "No research activity yet."}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
