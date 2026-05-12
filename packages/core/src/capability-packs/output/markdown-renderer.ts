import { showArtifact } from "../../artifacts/index.js";

export function markdownFromInput(input: {
  readonly markdown?: string;
  readonly source_artifact_id?: string;
  readonly title?: string;
  readonly normalize?: boolean;
  readonly index_path?: string;
}): { readonly title: string; readonly markdown: string; readonly input_artifact_refs: readonly string[] } {
  const artifact = input.source_artifact_id ? showArtifact(input.source_artifact_id, input.index_path) : undefined;
  const content = artifact?.content;
  const markdown = input.markdown ?? markdownFromContent(content);
  if (!markdown) throw new Error("Markdown input is required.");
  const title = input.title ?? artifact?.summary.title ?? titleFromMarkdown(markdown) ?? "Markdown export";
  const normalized = input.normalize === false ? markdown : normalizeMarkdown(title, markdown);
  return { title, markdown: normalized, input_artifact_refs: input.source_artifact_id ? [input.source_artifact_id] : [] };
}

export function normalizeMarkdown(title: string, markdown: string): string {
  const trimmed = markdown.trim();
  if (/^#\s+/m.test(trimmed)) return `${trimmed}\n`;
  return `# ${title}\n\n${trimmed}\n`;
}

function markdownFromContent(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.markdown === "string") return record.markdown;
  if (typeof record.content === "string") return record.content;
  return undefined;
}

function titleFromMarkdown(markdown: string): string | undefined {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
}
