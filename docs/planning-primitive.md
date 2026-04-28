# Planning Primitive

The Planning Primitive is the reusable control-plane layer for work that needs typed steps, validation, policy gates, approvals, artifacts, and durable progress.

Open Lagrange is a cognitive control plane for reconciled work. The model emits typed planning and execution artifacts. The control plane owns state, policy, capability snapshots, approval, execution, verification, artifacts, and progress.

## Flow

```text
vague user prompt
  -> GoalFrame
  -> Planfile DAG
  -> parse executable YAML
  -> validate plan
  -> dry-run preview
  -> approval/apply
  -> durable plan node execution
  -> artifacts/reports
  -> updated Planfile projection
```

The primitive keeps execution generic. It does not contain repository patching logic, Files Pack behavior, research-specific behavior, or Skill-to-Pack generation. Those layers plug in through PlanRunner handlers.

## Core Types

- `GoalFrame`: interpreted goal, acceptance criteria, non-goals, assumptions, ambiguity, suggested mode, and risk notes.
- `Planfile`: typed DAG with nodes, edges, approval policy, verification policy, artifacts, timestamps, and canonical digest.
- `PlanNode`: one cognitive step with dependencies, capability refs, risk, approval requirement, status, artifacts, and errors.
- `WorkOrder`: the bounded instruction packet compiled for one ready node.
- `PlanState`: persisted runtime projection of node state, artifacts, digest, and Markdown projection.

## Why This Helps Smaller Models

Smaller models perform better when work is decomposed into typed, bounded Work Orders. Each node receives objective, acceptance criteria, non-goals, assumptions, constraints, allowed capability snapshot, input artifacts, evidence, failures, and output schema. The model does not need to own the loop; it only emits typed artifacts inside a constrained step.

## Repository Task Pack Reuse

The Repository Task Pack can map inspect, patch, verify, review, and repair nodes to existing repository capabilities. The planning primitive supplies the DAG, digest, approvals, Work Orders, state transitions, and artifact projection. Repository-specific path policy, patch validation, command policy, and review generation remain inside the pack.

## Future Skill-to-Pack Reuse

Skill-to-Pack can use a Planfile to represent generation steps: inspect a skill, analyze capability boundaries, design descriptors, propose implementation artifacts, verify generated pack behavior, review risks, and finalize documentation. The same validation and approval path prevents model output from bypassing policy.

## Safety Rules

- Do not execute freeform Markdown.
- Do not parse Mermaid as execution state.
- Do not trust model output before schema and semantic validation.
- Do not execute write, destructive, or external side-effect nodes without approval.
- Do not treat a locally validated Planfile as trusted runtime state.
