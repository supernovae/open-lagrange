#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { Command } from "commander";

const program = new Command()
  .name("open-lagrange-tui")
  .description("Open Lagrange reconciliation cockpit.")
  .option("--repo <path>", "Repository root")
  .option("--goal <goal>", "Goal to submit on launch")
  .option("--project-id <projectId>", "Existing project ID to attach")
  .option("--workspace-id <workspaceId>", "Workspace ID")
  .option("--apply", "Apply repository patches immediately", false)
  .option("--dry-run", "Plan and require approval before writes", true)
  .option("--poll-interval <ms>", "Polling interval in milliseconds", "1500")
  .option("--api-url <url>", "Optional API URL for best-effort status display")
  .option("--hatchet-run-id <id>", "Accepted for compatibility; project ID is preferred");

program.parse(process.argv);
const options = program.opts<{
  readonly repo?: string;
  readonly goal?: string;
  readonly projectId?: string;
  readonly workspaceId?: string;
  readonly apply: boolean;
  readonly dryRun: boolean;
  readonly pollInterval: string;
  readonly apiUrl?: string;
}>();

const { App } = await import("./App.js");

render(
  <App
    {...(options.goal ? { goal: options.goal } : {})}
    {...(options.repo ? { repo: options.repo } : {})}
    {...(options.projectId ? { projectId: options.projectId } : {})}
    {...(options.workspaceId ? { workspaceId: options.workspaceId } : {})}
    apply={options.apply}
    dryRun={options.dryRun && !options.apply}
    pollIntervalMs={Number.parseInt(options.pollInterval, 10) || 1500}
    {...(options.apiUrl ? { apiUrl: options.apiUrl } : {})}
  />,
);
