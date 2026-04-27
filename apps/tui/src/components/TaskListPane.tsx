import React from "react";
import { Box, Text } from "ink";
import type { TaskStatusSnapshot } from "@open-lagrange/core/interface";
import { statusColor } from "../formatters.js";
import { theme } from "../theme.js";

export function TaskListPane({ tasks }: { readonly tasks: readonly TaskStatusSnapshot[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Tasks</Text>
      {tasks.map((task) => (
        <Text key={task.task_run_id}>
          <Text color={statusColor(task.status)}>{task.status}</Text> {task.task_id} {task.repository_status?.current_phase ? `(${task.repository_status.current_phase})` : ""}
        </Text>
      ))}
      {tasks.length === 0 ? <Text color={theme.muted}>No tasks yet.</Text> : null}
    </Box>
  );
}
