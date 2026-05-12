import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export function renderMarkdownToHtml(input: {
  readonly markdown: string;
  readonly title: string;
  readonly include_basic_styles?: boolean;
}): string {
  const raw = marked.parse(input.markdown, { async: false, gfm: true, breaks: false }) as string;
  const safe = sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2"]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      code: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(input.title)}</title>`,
    input.include_basic_styles === false ? "" : `<style>${basicStyles()}</style>`,
    "</head>",
    "<body>",
    `<main>${safe}</main>`,
    "</body>",
    "</html>",
  ].filter(Boolean).join("\n");
}

function basicStyles(): string {
  return "body{font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.55;margin:0;background:#f7f8f8;color:#172026}main{max-width:860px;margin:0 auto;padding:32px;background:#fff;min-height:100vh}pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}pre{overflow:auto;padding:12px;background:#f1f4f4}a{color:#0b5c73}";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
