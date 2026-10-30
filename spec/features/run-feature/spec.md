# run-feature

## Problem

Between the interview and the PR review, Daniel is the cron job.
Shipping one feature means opening tens of fresh sessions just to type `/implement-slice` (64 times in agents-hq alone, per session transcripts), plus manual `/write-spec` and `/write-slices` sessions before that.
Each slice takes an unpredictable 5 to 30 minutes, so he either babysits the terminal or context-switches and loses the thread, and he learns that a run halted or finished only by looking.

## Solution

One command, `run-feature <slug>`, typed when the interview ends.
It takes a committed decision record all the way to a ready PR: it generates the spec and slices headlessly if they are missing, then loops `/implement-slice` in a dedicated worktree until every slice is done or the run needs a human, and signals the end state once with a macOS banner.
The narrowest version is a manual kick with hardcoded defaults: no auto-trigger, no config file, no digest.

## Current state

- One `/implement-slice` call builds exactly one slice, and the next slice needs a fresh conversation (skills/in-progress/implement-slice/SKILL.md:8); nothing loops it.
- A slice is done when its commit is on the branch; progress lives only in git (skills/in-progress/implement-slice/SKILL.md:9), read via the trailer query `git log --format='%h Slice=[%(trailers:key=Slice,valueonly,...)] Pending=[...]'` with states done, pending, ready, blocked (skills/in-progress/implement-slice/SKILL.md:28-31).
- implement-slice already does everything inside one slice: picks the lowest ready slice, gates on checks and a verify run, reviews, commits with a `Slice:` trailer (or `Slice-Pending:` for hitl), pushes, and at branch end runs review-change, pr-brief and marks the PR ready (skills/in-progress/implement-slice/SKILL.md:25-36,45-49,58-81,83-86).
- A halted slice commits nothing and leaves a dirty tree (skills/in-progress/implement-slice/SKILL.md:49), and the next run refuses on a dirty tree (skills/in-progress/implement-slice/SKILL.md:21), so halts are detectable from outside only as "no new trailer".
- A missing verify skill makes implement-slice tell the user to run `/make-verify` and end the turn (skills/in-progress/implement-slice/SKILL.md:17-18); the verify skill lives at `.agents/skills/verify/` in the target project (.agents/conventions.md:160).
- write-spec and write-slices each take no new decisions but today each costs a manual session; both only write their file and tell the user to commit (skills/in-progress/write-spec/SKILL.md:90-92, skills/in-progress/write-slices/SKILL.md:60-62), and each has one interactive confirmation a headless run will skip (skills/in-progress/write-spec/SKILL.md:29, skills/in-progress/write-slices/SKILL.md:50-56).
- slices.json carries `id`, `kind`, `behaviours`, `seam`, `blocked_by`, `autonomy: afk|hitl` and `done` per slice, and no status field; git trailers stay the source of truth (skills/in-progress/write-slices/SKILL.md:64-91, .agents/conventions.md:167-168).
- Skill scripts in this repo are plain `.mjs`, Node 18+, zero dependencies, validating input and exiting non-zero with a readable message (.agents/conventions.md:100-104); the closest prior art is explore's 670-line zero-dependency CLI (skills/in-progress/explore/scripts/map.mjs:1-11).
- Nothing in the repo or any installed skill shells out to `claude`, parses trailers programmatically, creates worktrees, or sends a notification; the repo has no tests and CI runs only the release workflow (package.json:12-18, .github/workflows/release.yml:3-6).
- Headless `claude -p` does not prompt; a non-allowed tool call is simply denied, which can make a run wander or die silently.

## Behaviour

1. From a repo whose `decisions.md` for the feature is committed, one `run-feature <slug>` command reaches a ready PR on the slices branch with no further human input, when no slice is hitl.
2. The whole run happens in its own worktree; the main checkout is untouched throughout.
3. When the spec is missing, the runner writes and commits it headlessly before slicing; the same holds for the slices file.
4. When the target project has no verify skill, the runner halts before starting any slice with the message to run make-verify.
5. Each slice attempt is a fresh headless harness session running with acceptEdits permissions and the project's Bash allowlist.
6. A denied tool call halts the run.
7. An iteration that ends with no new slice trailer on the branch halts the run as "no progress".
8. The same slice id failing twice in a row halts immediately, and no single kick runs more than 12 iterations.
9. A slice awaiting human sign-off with nothing else ready halts the run and says which slice is waiting.
10. Clean completion removes the worktree, leaves the branch and PR intact, and exits 0; every halt keeps the worktree and exits non-zero.
11. Every end state, success or halt, fires exactly one macOS banner with sound naming that end state; detail stays in the terminal output and the PR.
12. After a human fixes the branch, re-running the same command resumes from the git state; nothing resumes on its own.
13. The runner reads progress only from git trailers and the slices file, never from harness stdout.

## Decisions

- **Permission posture**: `--permission-mode acceptEdits` plus a per-project Bash allowlist grown over time, with a denied call halting the run.
  Rejected: skipping permissions inside a worktree, because it hands unattended full shell to the main machine and is the one choice hard to walk back after an incident.
  Rejected: a container or VM sandbox, because it is setup cost the wedge does not need while the allowlist converges.
- **Trigger**: one manual command typed when the interview ends.
  Rejected: auto-trigger on the decision record landing and daemon-side scheduling, because they remove the one kick that expresses intent and belong to agents-hq later.
- **Resume after halt**: explicit re-kick after a human touched the branch.
  Rejected: auto-resume by polling, because it invites "it resumed while I was mid-edit" failures for a saving of one keystroke.
- **Notification**: a local `notify()` calling `osascript` for a banner plus sound, carrying only the end state.
  Rejected: no notification, because a 30-90 minute run with no signal reinstates the polling the runner exists to delete.
  Rejected: ntfy.sh for now, because the real workflow is other work on the same machine; `notify()` stays one function so ntfy later is a three-line change.
- **Implementation**: a user-invoked skill in the in-progress bucket whose loop is a single-file Node script with no dependencies.
  Rejected: bash, because git-trailer and slices-JSON parsing in bash is where v0s rot.
- **Pre-steps**: a missing spec or slices file makes the runner call the writing skills headlessly first; a missing verify skill halts.
  Rejected: refusing and telling the user, because both skills take no new decisions and refusing keeps two manual session-opens alive.
- **Ceilings**: max 12 iterations per kick, and the same slice id failing twice in a row halts immediately, so the pathological worst case is about two wasted attempts.
- **Worktree lifecycle**: auto-remove on clean completion, keep on halt so the human can cd in and fix.
  Rejected: always keep (dead weight) and always remove (destroys the intervention site).
- **Harness**: v0 shells out to `claude` only, isolated behind one function so a second harness is additive.
  Rejected: abstracting two harnesses before running one.
- **State source**: git trailers and the slices file are the only truth the loop reads; harness stdout is never parsed for state.

## Seams

- Primary and only new seam: the runner's process boundary, `node scripts/run.mjs` invoked with a feature slug against a target repo, observed through exit code, git state on the slices branch, worktree presence, and the PR.
  No existing seam can host this: the repo has no test script or test files at all (package.json:12-18), and no existing script invokes a harness.
- The seam's fixture is a sandbox project that already carries a conforming verify skill (/Users/danielnoworyta/github/skills-e2e-sandbox/.agents/skills/verify/SKILL.md), so an end-to-end run exercises the real pipeline without touching a live project.
- The runner consumes the existing trailer contract rather than adding one (skills/in-progress/implement-slice/SKILL.md:28-31), so every run through the seam also verifies that contract still holds.

## Sequence

1. The loop on an existing spec and slices file: kick, slices land one by one in a worktree, ready PR, success banner, worktree gone.
2. The halts: denial, no progress, repeated slice failure, iteration ceiling, and waiting sign-off each end the run loudly with the worktree kept.
3. Re-kick: running the same command after a human fix picks up from git state.
4. Pre-steps: a bare decision record grows its spec and slices headlessly before the loop starts, and a missing verify skill halts with the make-verify message.

## Out of scope

- Auto-trigger on the decision record landing.
- agents-hq daemon as execution backend.
- Any UI or dashboard.
- Per-project config file; v0 takes flags with hardcoded defaults.
- ntfy or any phone-reaching notification.
- Codex or OpenCode execution.
- Second-model reviewers inside review-change.
- New verify tooling.
- Auto-merge of any PR; gated on its own future decision record.
- Parallel slices or parallel features.
- A babysit-prs digest loop.

## Accepted breakage

- A denied Bash call halts the run even when harmless; early runs per project halt more than feels fair until the allowlist converges.
- stdout is not parsed, so an implement-slice run that exits without committing yields only a generic "no progress" halt.
- A macOS banner is missable away from the machine; halts can be found late until ntfy exists.
- A mediocre spec from headless write-spec or write-slices is discovered only at slice time, because their interactive confirmations are skipped.

## Done means

- **Automated**: in the sandbox project, one command takes a committed `decisions.md` with no spec through spec, slices, all slices committed with trailers on the slices branch, PR marked ready with an `attention:` label, worktree removed, exit 0.
- **Automated**: a forced halt (a hitl slice) leaves the worktree in place, exits non-zero, and fires a banner.
- **Automated**: with the target project's verify skill removed, the runner halts naming make-verify before any harness session starts.
- **Manual**: one real feature in agents-hq or edm runs end to end where the only human touches are the kick and the PR review.
