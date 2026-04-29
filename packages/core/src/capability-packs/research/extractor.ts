import { stableHash } from "../../util/hash.js";
import { createCitation, domainFromUrl } from "./citations.js";
import { ExtractedSource, type ExtractContentInput, type ExtractContentOutput } from "./schemas.js";

export function extractReadableContent(input: ExtractContentInput, now = new Date().toISOString()): ExtractContentOutput {
  const warnings: string[] = [];
  const source = input.html ?? input.markdown ?? input.text ?? "";
  const url = input.url ?? "https://example.invalid/fixture-source";
  const title = (input.html ? titleFromHtml(input.html) : firstMarkdownTitle(input.markdown ?? input.text ?? "")) ?? "Untitled source";
  const text = normalizeWhitespace(input.html ? stripHtml(input.html) : stripMarkdown(input.markdown ?? input.text ?? ""));
  const truncated = text.length > input.max_chars;
  const extractedText = truncated ? text.slice(0, input.max_chars) : text;
  if (truncated) warnings.push(`Extracted text truncated to ${input.max_chars} characters.`);
  if (input.source_artifact_id) warnings.push("Source artifact metadata lookup is not wired in this phase; provided text input was used.");
  const sourceId = `source_${stableHash({ url, text: extractedText.slice(0, 512) }).slice(0, 16)}`;
  const citation = createCitation({ source_id: sourceId, title, url, retrieved_at: now });
  return ExtractedSource.parse({
    source_id: sourceId,
    title,
    url,
    domain: domainFromUrl(url),
    extracted_text: extractedText,
    excerpt: excerpt(extractedText),
    word_count: wordCount(extractedText),
    truncated,
    citation,
    artifact_id: `source_text_${stableHash({ sourceId, now }).slice(0, 16)}`,
    warnings,
  });
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>#-]+/g, " ");
}

function titleFromHtml(html: string): string | undefined {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
}

function firstMarkdownTitle(text: string): string | undefined {
  return text.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function wordCount(value: string): number {
  return value.length === 0 ? 0 : value.split(/\s+/).length;
}

function excerpt(value: string): string {
  return value.length > 360 ? `${value.slice(0, 357)}...` : value;
}
