import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { paneTitle } from "../formatters.js";
import { theme } from "../theme.js";
import { ConversationPane } from "./ConversationPane.js";
import { TimelinePane } from "./TimelinePane.js";
import { TaskListPane } from "./TaskListPane.js";
import { ApprovalPane } from "./ApprovalPane.js";
import { PlanPane } from "./PlanPane.js";
import { DiffViewer } from "./DiffViewer.js";
import { VerificationPane } from "./VerificationPane.js";
import { ReviewPane } from "./ReviewPane.js";
import { ArtifactJsonPane } from "./ArtifactJsonPane.js";
import { HelpPane } from "./HelpPane.js";
import { PackBuilderPane } from "./PackBuilderPane.js";

export function DetailPane({ model, height }: { readonly model: TuiViewModel; readonly height: number }): React.ReactElement {
  return (
    <Box flexDirection="column" height={height} borderStyle="single" borderColor={theme.border} paddingX={1} flexGrow={1} flexShrink={1}>
      <Text color={theme.title}>{paneTitle(model.selectedPane)}</Text>
      {content(model)}
    </Box>
  );
}

function content(model: TuiViewModel): React.ReactElement {
  if (model.selectedPane === "chat") return <ConversationPane turns={model.conversation} />;
  if (model.selectedPane === "timeline") return <TimelinePane items={model.timeline} />;
  if (model.selectedPane === "tasks") return <TaskListPane tasks={model.project?.task_statuses ?? []} />;
  if (model.selectedPane === "plan") return <PlanPane model={model} />;
  if (model.selectedPane === "approvals") return <ApprovalPane approvals={model.approvals} />;
  if (model.selectedPane === "diff") return <DiffViewer model={model} />;
  if (model.selectedPane === "verification") return <VerificationPane results={model.verificationResults} />;
  if (model.selectedPane === "review") return <ReviewPane model={model} />;
  if (model.selectedPane === "pack_builder") return <PackBuilderPane model={model} />;
  if (model.selectedPane === "artifact_json") return <ArtifactJsonPane model={model} />;
  return <HelpPane />;
}
