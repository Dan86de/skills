---
name: run-feature
description: Loop implement-slice headlessly in a dedicated worktree until every slice of a feature is committed and its PR is ready.
disable-model-invocation: true
---

Take a feature whose decision record is committed all the way to a ready PR with one kick.
The loop is `scripts/run.mjs`, which sits next to this file: a zero-dependency Node script that creates a worktree on `slices/<slug>`, writes a missing spec or slices file headlessly first, runs one fresh headless harness session per slice, and reads progress only from git trailers and the slices file.

## Steps

1. **Find the slug**: the one given, or the only feature folder under `spec/features/`, or ask.
   The target repo is the current project unless the user names another.
2. **Check the input**: `spec/features/<slug>/decisions.md`, or an already written `spec.md`, is committed.
   With both missing, tell the user to settle the decisions first and end the turn.
3. **Kick the run**: from the target repo's root, run `node <skill-folder>/scripts/run.mjs <slug>`, resolving the script's full path from this skill's folder, and stream its output.
   When the target repo's own checkout is sitting on `slices/<slug>` with a clean tree, switch it back to the default branch first; the script refuses to run while any checkout holds the branch.
   Do not parse the harness sessions' output for state; the script already decides from git alone.
4. **Report the end state**: the exit code, the slices landed, the worktree path, and the PR.

## What the script does

- Creates the worktree as a sibling of the repo, named `<repo>-slices-<slug>`, on the branch `slices/<slug>`, so the main checkout stays untouched.
- Halts before any harness session when the project has no verify skill, naming make-verify.
- Writes a missing spec or slices file through a headless write-spec or write-slices session and commits it to the slices branch before the loop starts.
- Seeds a project that has no committed `.claude/settings.json` with a default Bash allowlist and commits it before any session, a baseline for the attended sessions a human runs in a kept worktree.
- Runs each slice attempt as a fresh `claude -p "/implement-slice spec/features/<slug>/"` session with `--dangerously-skip-permissions`: the worktree is dedicated and the loop is already trusted to commit and push, so an allowlist would only stall it.
- Appends a headless note to every session's system prompt, so a skill that would end its turn asking a question settles the choice with its own default instead of stalling the run.
- Refuses the kick readably when `slices/<slug>` is already checked out somewhere, naming the checkout to switch, instead of failing inside `git worktree add`.
- Between iterations it decides from `git log` trailers and `slices.json` alone, never from session stdout.
- After the last slice it runs one more session so implement-slice closes the branch and marks the PR ready.
- A kept worktree from a halted run is resumed by typing the same command again once its tree is committed or clean; nothing resumes on its own, and a foreign directory at the worktree path refuses.
- A failed iteration gets one retry; the same slice failing twice in a row halts, as does the 12-session ceiling per kick and a slice awaiting human sign-off with nothing else ready.
- Exit codes: 0 is clean completion with the worktree removed and the branch and PR intact; 1 is bad input or environment; 2 is a halt, which always keeps the worktree so a human can cd in and fix.
- Every end state, success or halt, fires exactly one macOS banner with sound carrying only the end state name; detail stays in the terminal output and the PR, and a machine that cannot show the banner just logs that it was skipped.

## Harness

v0 shells out to `claude` only, a deliberate exception to the portability checklist settled in `spec/features/run-feature/decisions.md`: the invocation is isolated behind one function so a second harness is additive.
