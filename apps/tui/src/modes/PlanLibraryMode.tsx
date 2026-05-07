import React from "react";
import { Box, Text } from "ink";
import type { TuiViewModel } from "../types.js";
import { theme } from "../theme.js";

export function PlanLibraryMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  const library = model.planLibrary;
  if (!library) return <Text color={theme.muted}>No Plan Library loaded. Use /library.</Text>;
  return (
    <Box flexDirection="column">
      <Text color={theme.title}>Libraries</Text>
      {library.libraries.map((item) => (
        <Text key={item.name}>
          {item.name} <Text color={theme.muted}>{item.source} {item.plan_count ?? 0} plan(s)</Text>
        </Text>
      ))}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Plans</Text>
        {library.plans.slice(0, 12).map((plan) => (
          <Text key={`${plan.name}:${plan.path}`}>
            {plan.title ?? plan.name} <Text color={theme.muted}>{plan.portability_level ?? "unknown"} {plan.path}</Text>
          </Text>
        ))}
        {library.plans.length === 0 ? <Text color={theme.muted}>No saved Planfiles found.</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.title}>Actions</Text>
        <Text>/check &lt;planfile&gt;   /plan apply &lt;planfile&gt;</Text>
        <Text>/plan library       /run list</Text>
      </Box>
    </Box>
  );
}
