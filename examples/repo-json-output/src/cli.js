#!/usr/bin/env node

const command = process.argv[2] ?? "status";

if (command === "status") {
  console.log("ok");
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
process.exit(1);
