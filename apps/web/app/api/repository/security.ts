import { delimiter, resolve } from "node:path";
import { HttpError } from "../http";

export function assertAllowedRepoRoot(repoRoot: string): void {
  const allowedRoots = configuredAllowedRoots();
  if (allowedRoots.length === 0 && process.env.NODE_ENV !== "production") return;
  if (allowedRoots.length === 0) throw new HttpError(503, { error: "REPO_ROOT_POLICY_NOT_CONFIGURED" });

  const requested = resolve(repoRoot);
  const allowed = allowedRoots.some((root) => requested === root || requested.startsWith(`${root}/`));
  if (!allowed) throw new HttpError(403, { error: "REPO_ROOT_DENIED" });
}

function configuredAllowedRoots(): readonly string[] {
  return (process.env.OPEN_LAGRANGE_ALLOWED_REPO_ROOTS ?? "")
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolve(item));
}
