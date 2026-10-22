---
name: implement-slice
description: Build one ready slice from a write-slices file, prove it with the project's verify skill, and commit it to the spec's branch and draft PR.
disable-model-invocation: true
---

Build exactly one **vertical slice**, prove it in the running product, and commit it with the proof attached.
One call is one slice; the next slice gets a fresh conversation.
Progress lives only in git: a slice is done when its commit is on the branch.

## Steps

1. **Find the slices file**: the path given, `spec/features/<slug>/slices.json` for a feature the user names, the only slices file under `spec/features/`, or ask.
   `<slug>` is its folder name; the branch is `slices/<slug>`.
   Read it and the spec it names.

2. **Find the verify skill**: a project skill that runs the product and records whether checks passed, and its feature map.
   With none, tell the user to run `/make-verify` and end the turn.

3. **Get on the branch.**
   A dirty tree stops the skill: list the files and leave them to the user.
   Switch to `slices/<slug>` and pull, or create it from the up-to-date default branch.
   Stop if the slices file or its spec is not committed on this branch, its `commit` is not an ancestor of `HEAD`, or the verify skill is not on this branch yet.

4. **Pick the slice** from the trailers on `<default-branch>..HEAD`:

   ```bash
   git log --format='%h Slice=[%(trailers:key=Slice,valueonly,separator=%x2C)] Pending=[%(trailers:key=Slice-Pending,valueonly,separator=%x2C)]' <default-branch>..HEAD
   ```

   **Done** has `Slice: <id>`, **pending** has only `Slice-Pending: <id>`, **ready** has neither and every `blocked_by` done, **blocked** is the rest.
   With `--signoff <id>`, follow [references/signoff.md](references/signoff.md) instead.
   Refuse a named slice that is done, or blocked (name the blocker); take it if it is ready or pending (rework).
   With none named, take the lowest ready id.
   If every slice is done and the PR has no `## Branch review` yet, go to step 9; if nothing is ready, say what is pending or blocked by what, and end the turn.
   Open your reply with it, for example `Slice S3: Reject a malformed header (also ready: S5)`.

5. **Build it** from pointers only: the spec's claimed Behaviour entries and Seams, the slice's `seam`, `done` and `scope`, the verify skill and map, and `git show` of each blocker's commit.
   A missing seam file the spec does not mark new means the spec and slices need regenerating: stop.
   Build only what the slice claims.
   Each `done.automated` item is a **verify item** if the verify skill can drive it, otherwise a **test item** at the slice's seam.
   Add missing behaviour to the feature map in this commit; changing what it already says needs a `manual` verdict.
   When an edge case forces you off the spec, take the conservative option, note it as a **deviation**, and keep going.

6. **Pass the gate** against the code you will commit: the project's typecheck, lint and tests pass; a verify run (call the Skill tool with the verify skill's name) started after your last edit has its verdict filled in, no `fail`, and `pass` on every verify item; every test item has a passing test.
   Unclaimed checks may be `not driven`.
   On `fail`, fix and rerun, up to three different causes.
   A `manual`, or a verify item `not driven`, means the map, the slicing or the change is wrong: the user decides.
   On any stop, commit nothing, leave the diff, report the check, the causes tried and the run folders, and end the turn.

7. **Review it**: call the Skill tool with "review-change" and the arguments `HEAD --no-check`.
   Its fixes are ungated edits, so pass step 6 again.
   Fix any `blocks` finding, regate, and review once more; a second `blocks`, or no subagent available, stops the slice like step 6.

8. **Commit and push** one commit to `slices/<slug>`, subject the slice title:

   ```text
   Reject a malformed header

   Slice S3 of spec/features/<slug>/spec.md, behaviours 4, 5.

   Verify run 20260927-103133-773664: Done
   - <verify item> -> <check heading>: pass
   - <test item> -> <test file>: pass
   Project checks: <each command>: pass

   Deviations:
   - <spec line or behaviour> - <what you did instead> - <why>

   <the review-change block, exactly as returned>

   Slice: S3
   ```

   `Deviations:` reads `- none` when there were none.
   A `hitl` slice lists its `done.manual` items under `Awaiting sign-off:` after the checks, with trailer `Slice-Pending: S3`.
   The first commit opens a draft PR to the default branch, titled as the spec, its body one line per slice (id, title, blockers) then `## Slices`.
   After each commit, append to `## Slices` a `### S3 - <title>` section with the short SHA and the commit body below the first line, trailer excluded.

9. **Close the branch** once every slice is done.
   Call the Skill tool with "review-change" and the default branch, the only review that sees duplication between slices, and check the branch against the spec yourself.
   Fix every `blocks` finding and spec gap, regate what the fixes touched, commit as `Address review` with proof and block, push, and append the block under `## Branch review`.
   Call the Skill tool with "pr-brief", then mark the PR ready for review.

## Report

The slice and its state, the commit and PR, the verify run, the review's `Open` lines, any deviations, the PR's attention level after step 9, and what is ready next.

## Guardrails

Push only to `slices/<slug>`, edit only its PR's body and `attention:` labels, and never force push or merge.
The slices file, the spec, and what the feature map already says are read-only.
