import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { paneTitle } from "../formatters.js";
import { theme } from "../theme.js";
import { TimelinePane } from "./TimelinePane.js";
import { TaskListPane } from "./TaskListPane.js";
import { ApprovalPane } from "./ApprovalPane.js";
import { DiffViewer } from "./DiffViewer.js";
import { VerificationPane } from "./VerificationPane.js";
import { ArtifactJsonPane } from "./ArtifactJsonPane.js";
import { HelpPane } from "./HelpPane.js";
import { HomeMode } from "../modes/HomeMode.js";
import { ChatMode } from "../modes/ChatMode.js";
import { PlanMode } from "../modes/PlanMode.js";
import { PlanLibraryMode } from "../modes/PlanLibraryMode.js";
import { RunMode } from "../modes/RunMode.js";
import { ReviewMode } from "../modes/ReviewMode.js";
import { PackMode } from "../modes/PackMode.js";
import { DoctorMode } from "../modes/DoctorMode.js";
import { DemoMode } from "../modes/DemoMode.js";
import { ResearchMode } from "../modes/ResearchMode.js";
import { CapabilitySummary } from "./CapabilitySummary.js";
import { ConversationPane } from "./ConversationPane.js";

export function DetailPane({ model, height }: { readonly model: TuiViewModel; readonly height: number }): React.ReactElement {
  if (model.selectedPane === "chat") {
    return (
      <Box flexDirection="column" height={height} overflow="hidden" borderStyle="single" borderColor={theme.border} paddingX={1} flexGrow={1} flexShrink={1}>
        <Text color={theme.title}>{paneTitle(model.selectedPane)}</Text>
        <ConversationPane turns={model.conversation} scrollOffset={model.scrollOffset} expandedTurnId={model.expandedTurnId} height={Math.max(4, height - 2)} />
      </Box>
    );
  }
  const inspectorHeight = inspectorHeightFor(model.selectedPane, height);
  const journalHeight = Math.max(5, height - inspectorHeight - 4);
  return (
    <Box flexDirection="column" height={height} overflow="hidden" borderStyle="single" borderColor={theme.border} paddingX={1} flexGrow={1} flexShrink={1}>
      <Text color={theme.title}>{paneTitle(model.selectedPane)}</Text>
      <Box flexDirection="column" height={inspectorHeight} overflow="hidden" flexShrink={1}>
        {content(model)}
      </Box>
      <Text color={theme.muted}>Journal</Text>
      <ConversationPane turns={model.conversation} scrollOffset={model.scrollOffset} expandedTurnId={model.expandedTurnId} height={journalHeight} />
    </Box>
  );
}

function content(model: TuiViewModel): React.ReactElement {
  if (model.selectedPane === "home") return <HomeMode model={model} />;
  if (model.selectedPane === "chat") return <ChatMode model={model} />;
  if (model.selectedPane === "timeline") return <TimelinePane items={model.timeline} />;
  if (model.selectedPane === "tasks") return <TaskListPane tasks={model.project?.task_statuses ?? []} />;
  if (model.selectedPane === "plan") return <PlanMode model={model} />;
  if (model.selectedPane === "plan_library") return <PlanLibraryMode model={model} />;
  if (model.selectedPane === "run") return <RunMode model={model} />;
  if (model.selectedPane === "approvals") return <ApprovalPane approvals={model.approvals} />;
  if (model.selectedPane === "diff") return <DiffViewer model={model} />;
  if (model.selectedPane === "verification") return <VerificationPane results={model.verificationResults} />;
  if (model.selectedPane === "review") return <ReviewMode model={model} />;
  if (model.selectedPane === "demo") return <DemoMode model={model} />;
  if (model.selectedPane === "research") return <ResearchMode model={model} />;
  if (model.selectedPane === "pack_builder") return <PackMode model={model} />;
  if (model.selectedPane === "doctor") return <DoctorMode model={model} />;
  if (model.selectedPane === "capabilities") return <CapabilitySummary model={model} />;
  if (model.selectedPane === "artifact_json") return <ArtifactJsonPane model={model} />;
  return <HelpPane />;
}

function inspectorHeightFor(pane: TuiViewModel["selectedPane"], height: number): number {
  const available = Math.max(4, height - 4);
  if (pane === "home") return Math.max(8, Math.floor(available * 0.42));
  if (pane === "artifact_json" || pane === "demo" || pane === "doctor") return Math.max(6, Math.floor(available * 0.42));
  if (pane === "help" || pane === "capabilities" || pane === "pack_builder") return Math.max(6, Math.floor(available * 0.5));
  return Math.max(5, Math.floor(available * 0.45));
}
