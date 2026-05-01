import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const VerificationCommand = z.object({
  command_id: z.string().min(1),
  display_name: z.string().min(1),
  executable: z.string().min(1),
  args: z.array(z.string()),
  timeout_ms: z.number().int().min(1_000),
  output_limit_bytes: z.number().int().min(1_000),
}).strict();

export const VerificationPolicy = z.object({
  allowed_commands: z.array(VerificationCommand),
}).strict();

export type VerificationCommand = z.infer<typeof VerificationCommand>;
export type VerificationPolicy = z.infer<typeof VerificationPolicy>;

export function detectVerificationPolicy(repoRoot: string): VerificationPolicy {
  const packagePath = join(repoRoot, "package.json");
  if (!existsSync(packagePath)) return VerificationPolicy.parse({ allowed_commands: [] });
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { readonly scripts?: Record<string, unknown> };
  const scripts = pkg.scripts ?? {};
  const allowed = ["typecheck", "test", "lint", "build"]
    .filter((name) => typeof scripts[name] === "string")
    .map((name) => VerificationCommand.parse({
      command_id: `npm_run_${name}`,
      display_name: `npm run ${name}`,
      executable: "npm",
      args: ["run", name],
      timeout_ms: name === "test" || name === "build" ? 120_000 : 60_000,
      output_limit_bytes: 40_000,
    }));
  return VerificationPolicy.parse({ allowed_commands: allowed });
}
