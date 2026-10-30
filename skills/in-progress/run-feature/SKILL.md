---
name: run-feature
description: Loop implement-slice headlessly in a dedicated worktree until every slice of a feature is committed and its PR is ready.
disable-model-invocation: true
---

Take a feature whose spec and slices are committed all the way to a ready PR with one kick.
The loop is `scripts/run.mjs`, which sits next to this file: a zero-dependency Node script that creates a worktree on `slices/<slug>`, runs one fresh headless harness session per slice, and reads progress only from git trailers and the slices file.

## Steps

1. **Find the slug**: the one given, or the only feature folder under `spec/features/`, or ask.
   The target repo is the current project unless the user names another.
2. **Check the inputs**: `spec/features/<slug>/slices.json` and the spec it names are committed.
   With them missing, tell the user to run the writing skills first and end the turn.
3. **Kick the run**: from the target repo's root, run `node scripts/run.mjs <slug>` (the script path is relative to this skill's folder) and stream its output.
   Do not parse the harness sessions' output for state; the script already decides from git alone.
4. **Report the end state**: the exit code, the slices landed, the worktree path, and the PR.

## What the script does

- Creates the worktree as a sibling of the repo, named `<repo>-slices-<slug>`, on the branch `slices/<slug>`, so the main checkout stays untouched.
- Runs each slice attempt as a fresh `claude -p "/implement-slice spec/features/<slug>/"` session with `--permission-mode acceptEdits` and the Bash allowlist from the project's committed settings.
- Between iterations it decides from `git log` trailers and `slices.json` alone, never from session stdout.
- After the last slice it runs one more session so implement-slice closes the branch and marks the PR ready.
- It refuses a worktree that already exists and stops when an iteration lands no new trailer.

## Harness

v0 shells out to `claude` only, a deliberate exception to the portability checklist settled in `spec/features/run-feature/decisions.md`: the invocation is isolated behind one function so a second harness is additive.
