import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stableHash } from "../../util/hash.js";
import type { SourceSearchResult } from "./schemas.js";

export interface ResearchFixtureSource {
  readonly source_id: string;
  readonly title: string;
  readonly url: string;
  readonly path: string;
  readonly snippet: string;
  readonly source_type: SourceSearchResult["source_type"];
  readonly domain: string;
  readonly confidence: SourceSearchResult["confidence"];
}

export interface ResearchFixtureIndex {
  readonly source_mode: "fixture";
  readonly sources: readonly ResearchFixtureSource[];
}

const ROOT = join(findRepoRoot(process.cwd()), "examples", "research-fixtures");

export function loadResearchFixtures(root = ROOT): ResearchFixtureIndex {
  return JSON.parse(readFileSync(join(root, "index.json"), "utf8")) as ResearchFixtureIndex;
}

export function readFixtureSource(sourceId: string, root = ROOT): { readonly source: ResearchFixtureSource; readonly content: string } | undefined {
  const index = loadResearchFixtures(root);
  const source = index.sources.find((item) => item.source_id === sourceId || item.url === sourceId);
  if (!source) return undefined;
  return { source, content: readFileSync(join(root, "sources", source.path), "utf8") };
}

export function sourceIdForUrl(url: string): string {
  return `source_${stableHash(url).slice(0, 16)}`;
}

function findRepoRoot(start: string): string {
  let current = start;
  for (;;) {
    if (existsSync(join(current, "examples", "research-fixtures", "index.json"))) return current;
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}
