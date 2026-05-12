import type { RenderPdfOutput } from "./schemas.js";

export function renderPdfUnsupported(): RenderPdfOutput {
  return {
    status: "unsupported",
    reason: "PDF rendering is optional and no sandboxed PDF renderer is configured in this build.",
    alternatives: ["markdown", "html", "zip"],
  };
}
