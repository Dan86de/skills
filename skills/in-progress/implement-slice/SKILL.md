---
name: implement-slice
description: Build one ready slice from a write-slices file, prove it with the project's verify skill, and commit it to the spec's branch and draft PR.
disable-model-invocation: true
---

# Implement Slice

Build exactly one slice, prove it in the running product, and commit it with the proof attached.

One call is one slice, in a fresh conversation.
The next slice gets the next conversation, so each one starts with a clean context and reads only what it points at.
Never start a second slice in the same call, even when one is ready and the first went quickly.

Everything this skill knows about progress comes from git.
The slices file is read-only, there are no notes between calls, and a slice is done when its commit is on the branch.

## Step 1: Find the slices file

Take the path from the invocation.
If none was given and `.scratch/slices/` holds exactly one file, use it and say so.
Otherwise ask for the path.

`<slug>` is the file's name without its extension, and the branch is `slices/<slug>`.

Read the file, then read the spec it names in full.

## Step 2: Find the verify skill

Look for a project skill, in `.agents/skills/` or a harness's own skills folder, whose `SKILL.md` says it runs the product and records whether a check passed.
Read its `SKILL.md` and the feature map it points at.

If there is none, stop.
Tell the user to run `/make-verify` in this project first, and end the turn.
There is no fallback: a slice built without a verify run is not done, and this skill never calls it done.

## Step 3: Get on the branch

The working tree must be clean, ignored files aside.
If it is not, stop and list the changed files.
A dirty tree is usually a failed attempt at a slice, and whether to keep, stash or discard it is the user's call, never this skill's.

If `slices/<slug>` exists, locally or on the remote, switch to it and pull.
If it does not, create it from the up-to-date default branch.

The slices file's `commit` must be an ancestor of `HEAD`.
If it is not, stop: the decomposition was made against a history this branch does not contain.

## Step 4: Read progress and pick the slice

Read the trailers of every commit between the default branch and `HEAD`:

```bash
git log --format='%h Slice=[%(trailers:key=Slice,valueonly,separator=%x2C)] Pending=[%(trailers:key=Slice-Pending,valueonly,separator=%x2C)]' <default-branch>..HEAD
```

Each line is one commit, with its `Slice:` values and its `Slice-Pending:` values in separate brackets.

A slice is:

- **done** when a commit carries `Slice: <id>`
- **pending** when a commit carries `Slice-Pending: <id>` and none carries `Slice: <id>`
- **ready** when it is neither, and every id in its `blocked_by` is done
- **blocked** otherwise

A pending slice does not unblock anything.

If the invocation names a slice with `--signoff`, go to [Sign-off](#sign-off).

If it names a slice, that is the slice.
Refuse, saying which blocker is not done, when it is blocked.
Refuse when it is done.
A pending slice may be named: that is rework after a sign-off found a problem, and it goes through every step below again.

If it names none, take the ready slice with the lowest id.
When nothing is ready, say which slices are pending and which are blocked, and by what, then end the turn.

The first line of your reply names the slice you took and the others that were ready, for example `Slice S3: Reject a malformed header (also ready: S5)`.

Check that the slice's seam file exists.
A seam the spec marks as new has no file yet, and passes.
If a cited file is missing, stop and tell the user to regenerate the spec and slices.

## Step 5: Build it

Your context is pointers, and nothing else:

- the spec's Behaviour entries whose numbers the slice claims, and its Seams section
- the slice's `seam`, `done` and, on non-feature kinds, `scope`
- the verify skill and the feature map
- `git show` of every commit whose `Slice:` trailer names one of this slice's blockers

Build only what the slice claims.
A behaviour another slice claims is not yours, even when it is one line away.

Before you start, sort each `done.automated` item:

- a **verify item** is one the verify skill can drive, usually written as a step in the feature map
- a **test item** is anything else a machine checks; it becomes a test at the slice's seam, if one does not already cover it

If a `done.automated` item describes behaviour the feature map does not have yet, update the map in this slice's commit, in the map's own shape.
That is adding what the spec asked for.
Changing what the map already says is not, and happens only through a `manual` verdict (Step 6).

## Step 6: Pass the gate

A slice is done when all of these hold at once, against the code you are about to commit:

1. The project's own typecheck, lint and test commands pass, taken from its scripts, its CI workflow or its agent instructions.
2. A verify run started after your last edit to the code.
   Call the Skill tool with the verify skill's name, and follow it.
   A run started before an edit proves the old code: start another.
3. That run's `evidence.md` has its verdict filled in.
   A placeholder verdict is an abandoned run, and proves nothing.
4. No check in it is `fail`.
5. Every verify item is paired with the check that proves it, and that check is `pass`.
6. Every test item is paired with the test that proves it, and that test passes.

A check this slice does not claim may come back `not driven`, and that is fine.
Everything else stops the slice:

- **A check fails.**
  Find the cause and fix it, then run the gate again.
  After three attempts at three different causes, stop.
- **A check comes back `manual`.**
  The product disagrees with the map because of this change, and whether the map or the change is wrong is the user's call.
  Stop, and never edit the map to make a check pass.
- **A verify item comes back `not driven`.**
  It was sliced as automated because verify can drive it, so either the slicing or the verify skill is wrong.
  Stop.

When you stop, commit nothing and add no trailer.
Leave the diff in the working tree, and report: the check or command that stopped you, each cause you tried and what it showed, and the run folders whose evidence shows it.
Then end the turn.

## Step 7: Commit and push

One commit per slice.
The subject is the slice's title.
The body carries the proof, because the evidence file itself stays on this machine:

```text
Reject a malformed header

Slice S3 of .scratch/specs/<slug>.md, behaviours 4, 5.

Verify run 20260927-103133-773664: Done
- <verify item> -> <check heading>: pass
- <test item> -> <test file>: pass
Project checks: <each command>: pass

Slice: S3
```

A `hitl` slice lists every `done.manual` item under `Awaiting sign-off:`, after the checks, and its trailer is `Slice-Pending: S3` instead.
It stays pending, unblocking nothing, until the user signs it off.

Push to `slices/<slug>`.

The first commit on a new branch also opens a draft PR from it to the default branch.
Its title is the spec's title.
Its body holds one line per slice, with id, title and blockers, then a `## Slices` heading.

After every commit, append a section to the PR body under `## Slices`: a `### S3 - <title>` heading, the commit's short SHA, and its proof lines exactly as the commit body has them.
Replace nothing that is already there.

Invoking this skill permits pushing to `slices/<slug>` and editing its own PR.
It permits nothing else: no other branch, no force push, and never a merge.

## Sign-off

`--signoff S4` records that the user has looked at a pending slice.

Refuse when S4 is not pending.
Otherwise show its `Awaiting sign-off:` list and the PR section for it, and ask the user to confirm each item.
When they confirm all of them, make an empty commit whose subject is `Sign off S4: <title>`, whose body lists each item as confirmed, and whose trailer is `Slice: S4`.
Push it and append `Signed off in <short SHA>` to S4's section in the PR body.

If they do not confirm, commit nothing.
They fix it by running this skill on S4 again, which rebuilds it through the gate.

## Step 8: Close the branch

After a commit that leaves every slice in the file done, finish the branch in the same call.

Review the whole branch against the default branch, and against the spec.
If a code-review skill is available, call the Skill tool with it; otherwise review the diff yourself.
Fix what the review finds, pass the gate once more for every slice the fix touched, and commit with `Address review` as the subject and the proof in the body.
Then mark the PR ready for review.

## Step 9: Report

- the slice, and whether it is done, pending sign-off or stopped
- the commit and the PR
- the verify run folder
- what is ready now, and that the next slice gets a fresh conversation: the user starts it with `/implement-slice`

## Rules that do not bend

- One slice per call. Never start another.
- Never commit a slice without a verify run that passed the gate. Tests alone are not the gate.
- Never edit the slices file, the spec, or what the feature map already says.
- Never put `Slice:` on a `hitl` slice before its sign-off.
- Never merge, force push, or push to any branch but `slices/<slug>`.
- Never leave progress anywhere but a commit trailer.
