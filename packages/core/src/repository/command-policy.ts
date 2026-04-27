import type { RepositoryCommand, RepositoryWorkspace } from "../schemas/repository.js";

const UNSAFE_TOKENS = /[|;&<>`$*?()[\]{}]/;

export function findAllowedCommand(workspace: RepositoryWorkspace, commandIdOrDisplay: string): RepositoryCommand | undefined {
  return workspace.allowed_commands.find((command) =>
    command.command_id === commandIdOrDisplay || command.display === commandIdOrDisplay,
  );
}

export function assertAllowedCommand(workspace: RepositoryWorkspace, commandIdOrDisplay: string): RepositoryCommand {
  if (workspace.denied_commands.includes(commandIdOrDisplay)) throw new Error("Command is denied by repository policy");
  if (UNSAFE_TOKENS.test(commandIdOrDisplay)) throw new Error("Command contains unsupported shell syntax");
  const command = findAllowedCommand(workspace, commandIdOrDisplay);
  if (!command) throw new Error("Command is not allowlisted");
  for (const token of [command.executable]) {
    if (UNSAFE_TOKENS.test(token)) throw new Error("Allowlisted command contains unsupported shell syntax");
  }
  return command;
}

export function defaultRepositoryCommands(): readonly RepositoryCommand[] {
  return [
    { command_id: "npm_test", executable: "npm", args: ["test"], display: "npm test" },
    { command_id: "npm_run_test", executable: "npm", args: ["run", "test"], display: "npm run test" },
    { command_id: "npm_run_lint", executable: "npm", args: ["run", "lint"], display: "npm run lint" },
    { command_id: "npm_run_typecheck", executable: "npm", args: ["run", "typecheck"], display: "npm run typecheck" },
    { command_id: "pnpm_test", executable: "pnpm", args: ["test"], display: "pnpm test" },
    { command_id: "pnpm_lint", executable: "pnpm", args: ["lint"], display: "pnpm lint" },
    { command_id: "pnpm_typecheck", executable: "pnpm", args: ["typecheck"], display: "pnpm typecheck" },
    { command_id: "git_diff_stat", executable: "git", args: ["diff", "--stat"], display: "git diff --stat" },
    { command_id: "git_diff", executable: "git", args: ["diff"], display: "git diff" },
    { command_id: "git_status_short", executable: "git", args: ["status", "--short"], display: "git status --short" },
  ];
}
