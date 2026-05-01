import { z } from "zod";
import { SourceCandidate } from "./source-types.js";

export const SearchProviderCall = z.object({
  provider_id: z.string().min(1),
  provider_kind: z.string().min(1),
  query: z.string().min(1),
  status: z.enum(["success", "failed", "skipped"]),
  result_count: z.number().int().min(0),
  error_code: z.string().optional(),
  message: z.string().optional(),
}).strict();

export const SearchResultSet = z.object({
  search_result_set_id: z.string().min(1),
  search_plan_id: z.string().min(1),
  topic: z.string().min(1),
  mode: z.enum(["live", "fixture", "test"]),
  provider_calls: z.array(SearchProviderCall),
  candidates: z.array(SourceCandidate),
  selected_candidates: z.array(SourceCandidate),
  deduped_count: z.number().int().min(0),
  filtered_count: z.number().int().min(0),
  warnings: z.array(z.string()),
  artifact_id: z.string().optional(),
}).strict();

export type SearchProviderCall = z.infer<typeof SearchProviderCall>;
export type SearchResultSet = z.infer<typeof SearchResultSet>;
