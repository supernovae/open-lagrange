import { z } from "zod";
import type { SourceCandidate, SearchProviderKind, SearchProviderMode } from "./source-types.js";

export const SearxngSearchProviderConfig = z.object({
  id: z.string().min(1),
  kind: z.literal("searxng"),
  baseUrl: z.string().url(),
  enabled: z.boolean().default(true),
  language: z.string().min(1).optional(),
  categories: z.array(z.string().min(1)).optional(),
}).strict();

export const SearchProviderConfig = z.discriminatedUnion("kind", [
  SearxngSearchProviderConfig,
]);

export const SearchProviderSearchInput = z.object({
  query: z.string().min(1),
  topic: z.string().min(1),
  max_results: z.number().int().min(1).max(25),
  domains_allowlist: z.array(z.string().min(1)).default([]),
  domains_denylist: z.array(z.string().min(1)).default([]),
  source_type_preferences: z.array(z.string().min(1)).default([]),
  urls: z.array(z.string().url()).default([]),
}).strict();

export const SearchProviderSearchOutput = z.object({
  candidates: z.array(z.unknown()),
  warnings: z.array(z.string()).default([]),
}).strict();

export interface SearchProvider {
  readonly provider_id: string;
  readonly kind: SearchProviderKind;
  readonly mode: SearchProviderMode;
  readonly isConfigured: () => Promise<boolean>;
  readonly search: (input: SearchProviderSearchInput) => Promise<{ readonly candidates: readonly SourceCandidate[]; readonly warnings: readonly string[] }>;
}

export type SearxngSearchProviderConfig = z.infer<typeof SearxngSearchProviderConfig>;
export type SearchProviderConfig = z.infer<typeof SearchProviderConfig>;
export type SearchProviderSearchInput = z.infer<typeof SearchProviderSearchInput>;
export type SearchProviderSearchOutput = z.infer<typeof SearchProviderSearchOutput>;
