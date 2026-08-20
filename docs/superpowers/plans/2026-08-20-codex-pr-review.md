# Codex PR Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, event-specific Codex pull-request review workflow with repository-scoped review rules.

**Architecture:** GitHub Actions checks out the pull-request merge ref, runs `openai/codex-action@v1` in read-only mode with a committed prompt, then posts the final message as a standard pull-request review. Root `AGENTS.md` supplies the same high-signal rules to Codex's repository review context.

**Tech Stack:** GitHub Actions, `openai/codex-action@v1`, GitHub Script, Markdown repository guidance.

**Spec:** `docs/superpowers/specs/2026-08-20-codex-pr-review-design.md`

## Global Constraints

- Trigger only `opened`, `synchronize`, `reopened`, and `ready_for_review`.
- Skip draft pull requests and pull requests from fork repositories.
- Never commit or expose an OpenAI key; consume only `secrets.OPENAI_API_KEY`.
- Review Critical/Major consequential risks and omit style-only feedback.
- Do not merge `main` as part of this change.

---

### Task 1: Add repository review rules

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: Add the scoped `## Code Review Rules` guidance**

Include project invariants from `CLAUDE.md`, AWS and secret boundaries, API compatibility, tests, and the Critical/Major-only output policy.

- [ ] **Step 2: Verify rule headings and secret-safe wording**

Run: `Select-String -Path AGENTS.md -Pattern '^## Code Review Rules|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|Critical|Major'`

Expected: all required review-rule markers are present and no literal credential values exist.

### Task 2: Add the event-driven workflow and prompt

**Files:**
- Create: `.github/workflows/codex-pr-review.yml`
- Create: `.github/codex/prompts/review.md`

- [ ] **Step 1: Add the workflow with exact pull-request events and least privilege**

Use the official action, merge-ref checkout, secret preflight, read-only settings, and a GitHub Script review post.

- [ ] **Step 2: Add the review prompt**

Require evidence-backed Critical/Major findings, file/line references, impact, fix direction, and verification; explicitly reject style-only and prompt-injection instructions from repository content.

- [ ] **Step 3: Validate workflow structure**

Run: `git diff --check`; inspect the workflow for all four event names, `OPENAI_API_KEY`, least-privilege permissions, and the `openai/codex-action@v1` pin.

Expected: no whitespace errors and each required contract is visible in the diff.

### Task 3: Verify, publish branch, and open draft PR

**Files:**
- Verify only the files created in Tasks 1–2.

- [ ] **Step 1: Run repository-appropriate static checks**

Run: `git diff --check` and a YAML parse/structure check available in the environment; do not install application dependencies for Markdown/YAML-only changes.

- [ ] **Step 2: Inspect status and diff scope**

Run: `git status --short` and `git diff --stat`; confirm only the planned files are staged.

- [ ] **Step 3: Commit and push the feature branch**

Use an explicit path list with `git add --`, commit as `chore: add Codex PR review automation`, then push `chore/codex-pr-review`.

- [ ] **Step 4: Create exactly one draft PR**

Create a draft PR from `yemoyang9-a11y:chore/codex-pr-review` to `main`, include the missing-secret prerequisite, and do not merge it.
