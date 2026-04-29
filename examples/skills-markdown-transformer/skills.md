# Markdown Transformer

Create a local workflow capability that accepts markdown text and returns a title, short summary, and action items.

## Inputs

- markdown text
- optional dry-run flag

## Outputs

- title
- summary
- action items
- artifact preview

## Side Effects

- none

## Requirements

- no network access
- no secrets
- no filesystem mutation
- dry-run-safe execution through the Capability Pack SDK
