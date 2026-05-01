export interface StatusOptions {
  readonly json?: boolean;
}

export function status(options: StatusOptions = {}): string {
  if (options.json) {
    return "json output is not implemented yet";
  }
  return "status: ok";
}

if (process.argv.includes("status")) {
  const output = status({ json: process.argv.includes("--json") });
  process.stdout.write(`${output}\n`);
}
