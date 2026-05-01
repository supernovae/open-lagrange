# Verification And Repair

Repository verification uses allowlisted command IDs. The runner executes commands as executable plus args with `shell: false`; it rejects shell chaining syntax in command fields.

```ts
{
  allowed_commands: [{
    command_id: string;
    display_name: string;
    executable: string;
    args: string[];
    timeout_ms: number;
    output_limit_bytes: number;
  }]
}
```

Package scripts named `typecheck`, `test`, `lint`, and `build` are detected as likely verification commands. The command runner enforces timeouts and output limits, then records a `VerificationReport`.

## VerificationReport

The report includes command results, pass/fail status, failure summaries, artifact ID, and timestamps. Failed command output is previewed and truncated when needed.

## Repair

Repair is bounded. The default loop records up to three attempts. If the same failure repeats, or scope expansion would be needed, the run yields with a `RepairDecision`.

Repair consumes the latest verification report, current patch artifact, evidence, and diff summary. Any repair patch must go through the same `PatchValidator` and `PatchApplier` rules.
