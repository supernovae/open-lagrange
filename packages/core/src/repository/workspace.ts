import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import { defaultRepositoryCommands } from "./command-policy.js";
import { RepositoryWorkspace, type RepositoryWorkspace as RepositoryWorkspaceType } from "../schemas/repository.js";

const RepositoryPolicyFile = z.object({
  allowed_paths: z.array(z.string()).optional(),
  denied_paths: z.array(z.string()).optional(),
  max_file_bytes: z.number().int().min(1).optional(),
  max_files_per_task: z.number().int().min(1).optional(),
  allowed_commands: z.array(z.object({
    command_id: z.string().min(1),
    executable: z.string().min(1),
    args: z.array(z.string()),
    display: z.string().min(1),
  }).strict()).optional(),
  denied_commands: z.array(z.string()).optional(),
  require_approval_for_write: z.boolean().optional(),
  require_approval_for_command: z.boolean().optional(),
}).strict();

export interface LoadRepositoryWorkspaceInput {
  readonly repo_root: string;
  readonly workspace_id?: string;
  readonly trace_id: string;
  readonly dry_run: boolean;
  readonly require_approval?: boolean;
}

export function loadRepositoryWorkspace(input: LoadRepositoryWorkspaceInput): RepositoryWorkspaceType {
  const repoRoot = resolve(input.repo_root);
  const policy = loadPolicy(repoRoot);
  return RepositoryWorkspace.parse({
    workspace_id: input.workspace_id ?? `repo_${basename(repoRoot).replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    repo_root: repoRoot,
    repo_name: basename(repoRoot),
    default_branch: "main",
    working_branch: "local",
    allowed_paths: policy.allowed_paths ?? ["**"],
    denied_paths: policy.denied_paths ?? [".git/**", ".env", ".env.*", "*.pem", "*.key", "id_rsa", "id_ed25519"],
    max_file_bytes: policy.max_file_bytes ?? 128_000,
    max_files_per_task: policy.max_files_per_task ?? 24,
    allowed_commands: policy.allowed_commands ?? defaultRepositoryCommands(),
    denied_commands: policy.denied_commands ?? [],
    require_approval_for_write: input.dry_run ? true : (input.require_approval ?? policy.require_approval_for_write ?? false),
    require_approval_for_command: policy.require_approval_for_command ?? false,
    trace_id: input.trace_id,
  });
}

function loadPolicy(repoRoot: string): z.infer<typeof RepositoryPolicyFile> {
  const policyPath = join(repoRoot, ".open-lagrange", "repository-policy.json");
  if (!existsSync(policyPath)) return {};
  return RepositoryPolicyFile.parse(JSON.parse(readFileSync(policyPath, "utf8")));
}
