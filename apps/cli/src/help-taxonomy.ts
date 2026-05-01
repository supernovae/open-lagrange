export interface CommandGroup {
  readonly title: string;
  readonly commands: readonly string[];
}

export const commandGroups: readonly CommandGroup[] = [
  { title: "Core Runtime", commands: ["init", "bootstrap", "up", "down", "restart", "status", "doctor", "logs", "tui"] },
  { title: "Primary Work", commands: ["plan", "run", "artifact", "pack"] },
  { title: "Configuration", commands: ["profile", "provider", "secrets", "auth", "model", "search"] },
  { title: "Domain Shortcuts", commands: ["repo", "research", "skill"] },
  { title: "Advanced/Dev", commands: ["demo", "eval"] },
];

export function groupedHelpText(): string {
  return [
    "",
    "Command taxonomy:",
    ...commandGroups.flatMap((group) => [
      `  ${group.title}:`,
      `    ${group.commands.join("  ")}`,
    ]),
    "",
    "Planfiles are the primary reusable surface. Domain commands remain as shortcuts for Planfile flows.",
  ].join("\n");
}
