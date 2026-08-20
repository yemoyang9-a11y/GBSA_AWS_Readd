# Codex PR Review Design

## Goal

Run a Codex review for repository pull requests on `opened`, `synchronize`, `reopened`, and `ready_for_review`, while keeping feedback focused on consequential defects.

## Decision

Use the official `openai/codex-action@v1` GitHub Action. The repository's workflow controls the exact pull-request event types and posts the action's final response as a standard GitHub pull-request review. Repository-specific review guidance lives in root `AGENTS.md`, which Codex also understands for interactive reviews.

## Scope and safety

- Run only for non-draft pull requests whose head repository is this repository. This prevents repository secrets from being sent to untrusted fork code while preserving all requested events for same-repository branches.
- Require the `OPENAI_API_KEY` GitHub Actions secret without printing its value. The workflow fails with an actionable message when it is absent.
- Check out the pull-request merge ref with `persist-credentials: false` and `fetch-depth: 0` so the review sees the complete repository and diff without retaining a write-capable checkout token.
- Grant only `contents: read` and `pull-requests: write`. The Codex job runs with `safety-strategy: drop-sudo` and `sandbox: read-only`.
- Post one standard `COMMENT` review per triggering event. The prompt carries file/line references in the body because unstructured model output cannot safely create multiple inline comments.

## Review policy

The repository rules prioritize:

1. Critical security and production risks: secret exposure, authentication/authorization bypass, spoiler/cutoff bypass, data loss, or an outage.
2. Major correctness risks: runtime bugs, regressions, API/contract breaks, unsafe AWS/Bedrock/RDS/EC2 configuration, and missing tests for release-gate behavior.

Style, naming, formatting, speculative concerns, and low-confidence suggestions are excluded. Findings must include evidence, impact, an exact fix direction, and a verification scenario.

## Operational prerequisite

After this PR is merged, an administrator must add `OPENAI_API_KEY` under repository Settings → Secrets and variables → Actions. The workflow intentionally does not create, print, or transmit a key value from this task.
