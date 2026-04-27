import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { generateTaskArtifact } from "../activities/cognition.js";
import { CapabilitySnapshot } from "../schemas/capabilities.js";
import { DelegationContext } from "../schemas/delegation.js";
import { CognitiveArtifact, Observation } from "../schemas/open-cot.js";
import { ScopedTask } from "../schemas/reconciliation.js";
import { z } from "zod";

export const GenerateTaskArtifactInput = z.object({
  scoped_task: ScopedTask,
  delegation_context: DelegationContext,
  capability_snapshot: CapabilitySnapshot,
  prior_observations: z.array(Observation).optional(),
}).strict();

export const generateTaskArtifactTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "generate-task-artifact",
  retries: 1,
  executionTimeout: "2m",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    const parsed = GenerateTaskArtifactInput.parse(input);
    const artifact = await generateTaskArtifact({
      scoped_task: parsed.scoped_task,
      delegation_context: parsed.delegation_context,
      capability_snapshot: parsed.capability_snapshot,
      prior_observations: parsed.prior_observations ?? [],
    });
    return toHatchetJsonObject(CognitiveArtifact.parse(artifact));
  },
});
