import { getHatchetClient } from "../hatchet/client.js";
import { toHatchetJsonObject, type HatchetJsonObject } from "../hatchet/json.js";
import { generateReviewArtifact } from "../activities/repository-cognition.js";
import { VerificationReport } from "../schemas/repository.js";
import { z } from "zod";

const Input = z.object({
  goal: z.string().min(1),
  changed_files: z.array(z.string()),
  diff_summary: z.string(),
  verification_report: VerificationReport,
}).strict();

export const generateRepositoryReviewTask = getHatchetClient().task<HatchetJsonObject, HatchetJsonObject>({
  name: "generate-repository-review",
  retries: 1,
  executionTimeout: "2m",
  fn: async (input: HatchetJsonObject): Promise<HatchetJsonObject> => {
    return toHatchetJsonObject(await generateReviewArtifact(Input.parse(input)));
  },
});
