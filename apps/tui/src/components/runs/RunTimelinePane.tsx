import React from "react";
import { Box, Text } from "ink";
import type { RunSnapshot } from "@open-lagrange/core/runs";
import { theme } from "../../theme.js";

export function RunTimelinePane({ run }: { readonly run: RunSnapshot | undefined }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Timeline</Text>
      {(run?.timeline ?? []).slice(-14).map((item) => (
        <Text key={item.event_id} {...(eventTone(item.type) === "error" ? { color: theme.error } : eventTone(item.type) === "warning" ? { color: theme.warn } : eventTone(item.type) === "success" ? { color: theme.ok } : {})}>
          {item.timestamp.slice(11, 19)} {item.type} {nodeLabel(item)} {eventSummary(item)}
        </Text>
      ))}
      {run?.timeline.length === 0 ? <Text color={theme.muted}>No events recorded.</Text> : null}
    </Box>
  );
}

function eventTone(type: string): "error" | "warning" | "success" | "info" {
  if (type.endsWith(".failed")) return "error";
  if (type.endsWith(".yielded") || type === "approval.requested") return "warning";
  if (type.endsWith(".completed")) return "success";
  return "info";
}

function nodeLabel(item: RunSnapshot["timeline"][number]): string {
  return "node_id" in item && item.node_id ? `(${item.node_id})` : "";
}

function eventSummary(item: RunSnapshot["timeline"][number]): string {
  if ("reason" in item && item.reason) return item.reason;
  if ("artifact_id" in item && item.artifact_id) return item.artifact_id;
  if ("approval_id" in item && item.approval_id) return item.approval_id;
  if ("errors" in item && item.errors[0]) return item.errors[0].message;
  return item.type;
}
