# GitHub PR Helper

## Goal
Read GitHub pull request metadata and write a review artifact.

## Inputs
- repository owner
- repository name
- pull request number

## Outputs
- pull request summary
- review notes artifact

## Tools
- GitHub pull request API

## Permissions
- github:pull_request:read

## Secrets
- github.default

## Approval
- Approval required before posting or mutating any pull request.

## Constraints
- Read-only behavior first.
- Posting comments is future work and must require approval.

