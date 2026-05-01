import { z } from "zod";

export const SearchProviderKind = z.enum(["manual_urls", "searxng", "brave", "tavily", "serpapi", "github", "local_docs", "fixture"]);
export const SearchProviderMode = z.enum(["live", "fixture", "test"]);
export const SearchSourceType = z.enum(["official", "documentation", "news", "paper", "blog", "forum", "repo", "unknown"]);
export const SearchConfidence = z.enum(["low", "medium", "high"]);

export const SourceCandidate = z.object({
  source_id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  snippet: z.string().optional(),
  source_type: SearchSourceType.default("unknown"),
  published_at: z.string().datetime().optional(),
  retrieved_at: z.string().datetime(),
  domain: z.string().min(1),
  confidence: SearchConfidence.default("medium"),
  provider_id: z.string().min(1),
  provider_kind: SearchProviderKind,
  rank: z.number().int().min(1),
}).strict();

export type SearchProviderKind = z.infer<typeof SearchProviderKind>;
export type SearchProviderMode = z.infer<typeof SearchProviderMode>;
export type SearchSourceType = z.infer<typeof SearchSourceType>;
export type SearchConfidence = z.infer<typeof SearchConfidence>;
export type SourceCandidate = z.infer<typeof SourceCandidate>;

export function domainFromSearchUrl(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}
