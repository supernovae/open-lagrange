import { stableHash } from "../../util/hash.js";
import { Citation, type Citation as CitationType } from "./schemas.js";

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}

export function createCitation(input: {
  readonly source_id: string;
  readonly title: string;
  readonly url: string;
  readonly retrieved_at: string;
  readonly published_at?: string;
}): CitationType {
  return Citation.parse({
    citation_id: `cite_${stableHash({ source_id: input.source_id, url: input.url }).slice(0, 16)}`,
    source_id: input.source_id,
    title: input.title,
    url: input.url,
    domain: domainFromUrl(input.url),
    retrieved_at: input.retrieved_at,
    ...(input.published_at ? { published_at: input.published_at } : {}),
  });
}

export function citationLabel(citation: CitationType): string {
  return `[${citation.citation_id}](${citation.url})`;
}
