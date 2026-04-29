# HTTP JSON Fetcher

## Goal
Fetch JSON from a declared read-only HTTP API and produce a summary artifact.

## Inputs
- URL under `https://api.example.com`
- JSON path to summarize

## Outputs
- JSON summary artifact

## Tools
- HTTP JSON fetch capability

## Permissions
- project:read

## Constraints
- Do not write files outside generated artifacts.
- Do not contact hosts outside `api.example.com`.
