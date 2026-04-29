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
import { RunMode } from "../modes/RunMode.js";
import { ReviewMode } from "../modes/ReviewMode.js";
import { PackMode } from "../modes/PackMode.js";
import { DoctorMode } from "../modes/DoctorMode.js";
import { CapabilitySummary } from "./CapabilitySummary.js";

export function DetailPane({ model, height }: { readonly model: TuiViewModel; readonly height: number }): React.ReactElement {
  return (
    <Box flexDirection="column" height={height} borderStyle="single" borderColor={theme.border} paddingX={1} flexGrow={1} flexShrink={1}>
      <Text color={theme.title}>{paneTitle(model.selectedPane)}</Text>
      {content(model)}
    </Box>
  );
}

function content(model: TuiViewModel): React.ReactElement {
  if (model.selectedPane === "home") return <HomeMode model={model} />;
  if (model.selectedPane === "chat") return <ChatMode model={model} />;
  if (model.selectedPane === "timeline") return <TimelinePane items={model.timeline} />;
  if (model.selectedPane === "tasks") return <TaskListPane tasks={model.project?.task_statuses ?? []} />;
  if (model.selectedPane === "plan") return <PlanMode model={model} />;
  if (model.selectedPane === "run") return <RunMode model={model} />;
  if (model.selectedPane === "approvals") return <ApprovalPane approvals={model.approvals} />;
  if (model.selectedPane === "diff") return <DiffViewer model={model} />;
  if (model.selectedPane === "verification") return <VerificationPane results={model.verificationResults} />;
  if (model.selectedPane === "review") return <ReviewMode model={model} />;
  if (model.selectedPane === "pack_builder") return <PackMode model={model} />;
  if (model.selectedPane === "doctor") return <DoctorMode model={model} />;
  if (model.selectedPane === "capabilities") return <CapabilitySummary model={model} />;
  if (model.selectedPane === "artifact_json") return <ArtifactJsonPane model={model} />;
  return <HelpPane />;
}
