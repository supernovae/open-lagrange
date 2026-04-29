import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface StaticSafetyFinding {
  readonly path: string;
  readonly pattern: string;
  readonly message: string;
  readonly severity: "error" | "manual_review";
}

export interface StaticSafetyReport {
  readonly passed: boolean;
  readonly findings: readonly StaticSafetyFinding[];
}

const unsafePatterns: readonly Omit<StaticSafetyFinding, "path">[] = [
  { pattern: "child_process", message: "Generated code must not import child_process.", severity: "error" },
  { pattern: "exec(", message: "Generated code must not call exec.", severity: "error" },
  { pattern: "spawn(", message: "Generated code must not call spawn.", severity: "error" },
  { pattern: "eval(", message: "Generated code must not call eval.", severity: "error" },
  { pattern: "new Function", message: "Generated code must not construct functions dynamically.", severity: "error" },
  { pattern: "process.env", message: "Generated code must not read secrets from process.env directly.", severity: "error" },
  { pattern: "fetch(", message: "Generated code must use SDK HTTP primitives instead of raw fetch.", severity: "error" },
  { pattern: "from \"fs\"", message: "Generated code must not import fs directly.", severity: "error" },
  { pattern: "from 'fs'", message: "Generated code must not import fs directly.", severity: "error" },
  { pattern: "from \"node:fs\"", message: "Generated code must not import node:fs directly.", severity: "error" },
  { pattern: "from 'node:fs'", message: "Generated code must not import node:fs directly.", severity: "error" },
  { pattern: "from \"net\"", message: "Generated code must not import net directly.", severity: "error" },
  { pattern: "from 'net'", message: "Generated code must not import net directly.", severity: "error" },
  { pattern: "from \"node:net\"", message: "Generated code must not import node:net directly.", severity: "error" },
  { pattern: "from 'node:net'", message: "Generated code must not import node:net directly.", severity: "error" },
  { pattern: "from \"tls\"", message: "Generated code must not import tls directly.", severity: "error" },
  { pattern: "from 'tls'", message: "Generated code must not import tls directly.", severity: "error" },
  { pattern: "from \"http\"", message: "Generated code must not import http directly.", severity: "error" },
  { pattern: "from 'http'", message: "Generated code must not import http directly.", severity: "error" },
  { pattern: "from \"https\"", message: "Generated code must not import https directly.", severity: "error" },
  { pattern: "from 'https'", message: "Generated code must not import https directly.", severity: "error" },
  { pattern: "console.log(token", message: "Generated code must not log secret-looking values.", severity: "error" },
  { pattern: "logger.info(token", message: "Generated code must not log secret-looking values.", severity: "error" },
  { pattern: "TODO unsafe", message: "Generated code declares unsafe pending work.", severity: "manual_review" },
  { pattern: "requires_manual_review", message: "Generated code requested manual review.", severity: "manual_review" },
];

export function validateStaticSafety(input: {
  readonly pack_path: string;
  readonly files: readonly string[];
}): StaticSafetyReport {
  const findings: StaticSafetyFinding[] = [];
  for (const file of input.files.filter((item) => item.endsWith(".ts"))) {
    const text = readFileSync(join(input.pack_path, file), "utf8");
    for (const pattern of unsafePatterns) {
      if (text.includes(pattern.pattern)) findings.push({ path: file, ...pattern });
    }
    if (file.startsWith("src/capabilities/") && !text.includes("@open-lagrange/capability-sdk/primitives")) {
      findings.push({
        path: file,
        pattern: "missing sdk primitives",
        message: "Generated capability code should use SDK primitives for artifact, secret, policy, approval, or HTTP access.",
        severity: "manual_review",
      });
    }
    if (text.includes("http.fetch(") || text.includes("http.fetchJson(") || text.includes("http.downloadToArtifact(")) {
      if (!text.includes("timeout_ms")) {
        findings.push({
          path: file,
          pattern: "missing timeout_ms",
          message: "SDK HTTP primitive calls in generated code must declare timeout_ms.",
          severity: "error",
        });
      }
      if (!text.includes("max_bytes")) {
        findings.push({
          path: file,
          pattern: "missing max_bytes",
          message: "SDK HTTP primitive calls in generated code must declare max_bytes.",
          severity: "error",
        });
      }
    }
    if (/large|download|response body/i.test(text) && !text.includes("capture_body_as_artifact") && !text.includes("artifacts.write")) {
      findings.push({
        path: file,
        pattern: "missing artifact capture",
        message: "Generated code that handles large outputs should capture them as artifacts.",
        severity: "manual_review",
      });
    }
    if (/console\.(log|info|warn|error)\([^)]*(secret|token|api[_-]?key)/i.test(text)) {
      findings.push({ path: file, pattern: "secret logging", message: "Generated code appears to log secret-like values.", severity: "error" });
    }
  }
  return { passed: findings.every((finding) => finding.severity !== "error"), findings };
}
