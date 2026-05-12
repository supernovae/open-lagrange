import React from "react";
import { Box } from "ink";
import type { TuiViewModel } from "../types.js";
import { RunFrame } from "../components/runs/RunFrame.js";
import { RunOutputPane } from "../components/runs/RunOutputPane.js";
import { RunDetailPane } from "../components/runs/RunDetailPane.js";

export function OutputMode({ model }: { readonly model: TuiViewModel }): React.ReactElement {
  return (
    <Box flexDirection="row" columnGap={2}>
      <Box flexDirection="column" width="34%">
        <RunFrame run={model.run} {...(model.runConnectionState ? { connectionState: model.runConnectionState } : {})} />
      </Box>
      <Box flexDirection="column" width="40%">
        <RunOutputPane run={model.run} />
      </Box>
      <Box flexDirection="column" width="26%">
        <RunDetailPane run={model.run} />
      </Box>
    </Box>
  );
}
