import type { CapabilityPack } from "@open-lagrange/capability-sdk";
import {
  CreateBriefInput,
  CreateBriefOutput,
  CreateSourceSetInput,
  CreateSourceSetOutput,
  ExportMarkdownInput,
  ExportMarkdownOutput,
  ExtractContentInput,
  ExtractContentOutput,
  ResearchFetchSourceInput,
  ResearchFetchSourceOutput,
  ResearchSearchInput,
  ResearchSearchOutput,
} from "./schemas.js";
import { researchCapability } from "./descriptors.js";
import {
  runResearchCreateBrief,
  runResearchCreateSourceSet,
  runResearchExportMarkdown,
  runResearchExtractContent,
  runResearchFetchSource,
  runResearchSearch,
} from "./executor.js";
import { researchManifest } from "./manifest.js";

export const researchPack: CapabilityPack = {
  manifest: researchManifest,
  capabilities: [
    researchCapability({
      name: "research.search",
      description: "Search deterministic fixture sources, or report unsupported live search when requested.",
      input_schema: ResearchSearchInput,
      output_schema: ResearchSearchOutput,
      side_effect_kind: "none",
      execute: runResearchSearch,
    }),
    researchCapability({
      name: "research.fetch_source",
      description: "Fetch a fixture or explicit live URL and record source snapshot artifacts.",
      input_schema: ResearchFetchSourceInput,
      output_schema: ResearchFetchSourceOutput,
      side_effect_kind: "network_read",
      execute: runResearchFetchSource,
    }),
    researchCapability({
      name: "research.extract_content",
      description: "Extract readable source text and citation metadata from supplied HTML, Markdown, or text.",
      input_schema: ExtractContentInput,
      output_schema: ExtractContentOutput,
      side_effect_kind: "none",
      execute: runResearchExtractContent,
    }),
    researchCapability({
      name: "research.create_source_set",
      description: "Create a deterministic curated set of extracted sources.",
      input_schema: CreateSourceSetInput,
      output_schema: CreateSourceSetOutput,
      side_effect_kind: "none",
      execute: runResearchCreateSourceSet,
    }),
    researchCapability({
      name: "research.create_brief",
      description: "Create a cited Markdown research brief from supplied extracted sources only.",
      input_schema: CreateBriefInput,
      output_schema: CreateBriefOutput,
      side_effect_kind: "none",
      execute: runResearchCreateBrief,
    }),
    researchCapability({
      name: "research.export_markdown",
      description: "Export research Markdown as an indexed artifact.",
      input_schema: ExportMarkdownInput,
      output_schema: ExportMarkdownOutput,
      side_effect_kind: "none",
      execute: runResearchExportMarkdown,
    }),
  ],
};
