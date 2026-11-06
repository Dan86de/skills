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
- Installs the worktree's dependencies before any session when it has a lockfile and no `node_modules`, with the lockfile's frozen install: pnpm, npm, yarn or bun.
  A failed install halts as `install failed`, since a project's commit hooks and verify skill usually need those dependencies.
- Halts as `commit refused` or `push refused`, quoting git's reason, when a hook or the remote rejects a file the script commits itself.
- Writes a missing spec or slices file through a headless write-spec or write-slices session and commits it to the slices branch before the loop starts.
- Seeds a project that has no committed `.claude/settings.json` with a default Bash allowlist and commits it before any session, a baseline for the attended sessions a human runs in a kept worktree.
- Runs each slice attempt as a fresh `/implement-slice spec/features/<slug>/` session with full access: the worktree is dedicated and the loop is already trusted to commit and push, so an allowlist would only stall it.
- Runs each session through the local agents-hq daemon (`scripts/daemon-session.mjs`, port `AGENTS_HQ_PORT` or 4760) when one on contract 5 or later answers, so it is a named session on the board that can be watched and stopped there, ends it once it has stayed settled for a minute (a finished background command reads as settled until the turn it wakes first produces output), and groups the kick into one run on the Runs page, with each session's outcome and retries nested under the attempt they follow; otherwise it logs that and falls back to `claude -p --dangerously-skip-permissions`, off the board.
- Keys that run by repo and slug, so a re-kick reopens the feature's card on the board instead of starting another.
- Names the session it was kicked from, read from `AGENTS_HQ_SESSION_ID`, as the run's launcher, so the card shows `Started from`; a kick from outside any session names none and the card keeps the last one, and a daemon on contract 6 or earlier ignores the name and shows no line.
- Reports the whole plan to the run on every state change, from the first moment the slices file exists, and links each slice session to its slice; a session that is not a slice (writing the spec or slices, closing the branch) has no link.
- Ends the run with an outcome the card can read: `waiting` when a sign-off halts it, `stopped` with `re-kick to continue` at the session ceiling, `failed` when a slice fails twice in a row, `stopped` with the reason for any other halt, `failed` for a bad-input or environment exit, and `completed` on a clean finish.
- Appends a headless note to every session's system prompt, so a skill that would end its turn asking a question settles the choice with its own default instead of stalling the run.
- Refuses the kick readably when `slices/<slug>` is already checked out somewhere, naming the checkout to switch, instead of failing inside `git worktree add`.
- Between iterations it decides from `git log` trailers and `slices.json` alone, never from session stdout.
- A slice with only `done.manual` items is `afk`: it commits as done, so its dependents and the close carry on, and its checks wait for a person in the ready PR's `## Before you merge`.
- After the last slice it runs one more session so implement-slice closes the branch and marks the PR ready.
- It trusts that close only after checking it: a commit with a `Manual-Checks:` trailer when an `afk` slice has `done.manual` items, and the PR out of draft through `gh`, the one thing read from outside git.
  With no `origin`, the trailer check runs alone.
  Either failing is a `close incomplete` halt.
- A kept worktree from a halted run is resumed by typing the same command again once its tree is committed or clean; nothing resumes on its own, and a foreign directory at the worktree path refuses.
- A session the daemon loses halts as `session lost` and one ended on the board halts as `session ended`, with no retry for either: a lost session may still be working in the worktree, and a person who ended one wants the kick to stop.
- A failed iteration gets one retry; the same slice failing twice in a row halts, as does the 12-session ceiling per kick and a `hitl` slice, one needing an action only a person can take, with nothing else ready.
- Exit codes: 0 is clean completion with the worktree removed and the branch and PR intact; 1 is bad input or environment; 2 is a halt, which always keeps the worktree so a human can cd in and fix.
- Every end state, success or halt, fires exactly one macOS banner with sound carrying only the end state name; detail stays in the terminal output and the PR, and a machine that cannot show the banner just logs that it was skipped.

## Harness

v0 shells out to `claude` only, a deliberate exception to the portability checklist settled in `spec/features/run-feature/decisions.md`: the invocation is isolated behind one function so a second harness is additive.
