import { spawn } from "node:child_process";
import { assertAllowedCommand } from "../../repository/command-policy.js";
import { VerificationResult, type RepositoryWorkspace, type VerificationResult as VerificationResultType } from "../../schemas/repository.js";

export async function runRepositoryVerification(input: {
  readonly workspace: RepositoryWorkspace;
  readonly command_id: string;
  readonly timeout_ms: number;
  readonly output_limit: number;
}): Promise<VerificationResultType> {
  const command = assertAllowedCommand(input.workspace, input.command_id);
  const started = Date.now();
  const result = await new Promise<{ readonly stdout: string; readonly stderr: string; readonly exit_code: number; readonly timed_out: boolean }>((resolve) => {
    const child = spawn(command.executable, command.args, { cwd: input.workspace.repo_root, shell: false });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGTERM");
      resolve({ stdout, stderr, exit_code: 124, timed_out: true });
    }, input.timeout_ms);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exit_code: code ?? 1, timed_out: false });
    });
  });
  const stdout = truncate(result.stdout, input.output_limit);
  const stderr = truncate(result.stderr, input.output_limit);
  return VerificationResult.parse({
    command_id: command.command_id,
    command: command.display,
    exit_code: result.exit_code,
    stdout_preview: stdout.text,
    stderr_preview: stderr.text,
    duration_ms: Date.now() - started,
    truncated: result.timed_out || stdout.truncated || stderr.truncated,
  });
}

function truncate(value: string, limit: number): { readonly text: string; readonly truncated: boolean } {
  if (value.length <= limit) return { text: value, truncated: false };
  return { text: value.slice(0, limit), truncated: true };
}
