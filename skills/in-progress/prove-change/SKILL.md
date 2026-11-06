---
name: prove-change
description: Check a branch against its spec and attack its diff from contexts that did not write it, keeping only findings a failing test or driver proves. Use at a branch close, when the user asks whether a branch does what its spec says or wants its open `possible bug:` questions settled, or another skill needs the spec checked by someone other than the implementer.
---

The implementer checking its own branch against the spec agrees with itself.
This skill hands the branch to two provers that did not write it: a spec prover that walks the spec, and a bug prover that attacks the diff.
Each keeps a finding only when a test or driver it wrote fails at the branch `HEAD`, and this skill reruns every proof before it believes one.
It reports and hands the surviving proofs to your working tree; it fixes nothing.

Arguments: the spec's path, then an optional fixed point.

## Steps

1. **Pin the branch.**
   The fixed point defaults to the merge-base of `HEAD` and the default branch; pass one when the default branch already holds the branch, as on a replay.
   Resolve both with `git rev-parse --verify <ref>^{commit}` and stop if either fails, or if `git log <fixed-point>..HEAD` is empty.
   The provers see committed work only: name any uncommitted change in the report, and do not prove it.
   Stop if `git check-ignore -q .scratch/` fails: the provers' worktrees go there and must stay out of your tree's status.
   Stop if the spec has no `## Behaviour` section with numbered entries.

2. **Collect the inputs**: the spec, the changed files from `git diff --name-only <fixed-point> HEAD`, the agent instruction files at the root, and the project's verify skill and its feature map if it has them.
   The verify skill is `.agents/skills/verify/`, else a `verify` skill in a harness skills folder; the feature map is `docs/manual/`.
   Also collect the **recorded deviations**: every `Deviations:` item in `git log --format=%B <fixed-point>..HEAD`, skipping `- none`.
   They are input, not findings: each already says what the branch does instead and why.
   And collect the **open questions**: every line in that log containing `possible bug:` with no ` => fixed:` or ` => stands:` on it, the outcomes review-change defines.
   A line repeated word for word is one question, and one that appears elsewhere in the log followed by an outcome is settled.
   Number them `Q1` on, oldest commit first, keeping each line verbatim.

3. **Make one worktree per prover** at `HEAD`, detached, under the run's own folder:

   ```bash
   prove=.scratch/prove-change/$(date +%Y%m%d-%H%M%S)-$(printf '%04x' $RANDOM)
   git worktree add --detach "$prove/spec" HEAD
   git worktree add --detach "$prove/bug" HEAD
   ```

   Each prover writes only in its own, so neither collides with the other, and nothing either adds reaches your tree until step 9 copies the survivors.

4. **Run both provers at once**, each in its own fresh subagent: the spec prover with everything below the line in [references/spec-prover-brief.md](references/spec-prover-brief.md), and the bug prover with everything below the line in [references/bug-prover-brief.md](references/bug-prover-brief.md), placeholders filled and paths absolute.
   Start both before waiting on either.
   If your harness has no subagents, stop and tell the user to run this skill in a fresh session: the context that wrote the branch will agree with it.

5. **Check the spec prover's block**: it matches the brief's template, it has exactly one line per Behaviour entry of the spec, every `passing` line names a test or driver the prover ran, and every `missing` or `looks wrong` line names a proof file in the prover's worktree and the command that fails.
   Every `not asked for` line names diff lines and a spec line, and no proof or command.
   Every `Dropped` line gives one reason.
   No line reports a departure a recorded deviation already names.

6. **Check the bug prover's block**: it matches the brief's template, and `Questions` has exactly one line per open question, each `proven` or `dropped`.
   Every `proven` line, in `Questions` or `Attack`, names a proof file in the prover's worktree and the command that fails; every `dropped` line, and every line under `Dropped`, gives one reason.
   `Attack` holds only bugs that no open question or recorded deviation names, or `- none found` with what was attacked.

7. **Send back a block that misses** once, naming what failed; if it still fails, return it with a `Shape:` line after it.

8. **Recheck every proof at `HEAD`** yourself: each `missing` and `looks wrong` line, and each `proven` line in `Questions` or `Attack`.
   First run `git -C <worktree> status --porcelain` in each prover's worktree: a proof is an untracked file, and any tracked file shown changed is product code the prover edited against its brief.
   Restore each such file with `git -C <worktree> restore --source=HEAD --staged --worktree -- <path>`, and name it in the report, so every proof reruns against `HEAD` as committed; a proof that then fails on setup is dropped with that edit as its reason.
   Then run the project's typecheck and lint in each prover's worktree, with its proofs in place: a proof gets committed unedited, and running it does not check its types.
   Send each prover whose proof fails them back once, naming the errors, and recheck what it returns; a proof that still fails them is dropped with its first error as the reason.
   Then run each proof's command twice in its prover's worktree, as the verify skill says: a driver's `$run` is a verify run you start there, and stop after.
   Keep a finding only when both runs fail for the reason its line states, with the first failing line it records, IDs and timings aside: a test on that assertion, and a driver with that `not ok - ` line and exit 1.
   Drop it with a one-line reason when either run passes, exits 2, fails on setup such as a missing module, a missing build, a syntax or type error in the proof itself, or a timeout, or fails on anything other than what the line states.

9. **Hand over the survivors**: copy each kept finding's proof file, and every untracked file it imports, from its prover's worktree to the same path in your working tree, once per file.
   Never overwrite: a path that already exists in your tree stays as it is, and the report names it with the proof left in the worktree.
   Copy nothing else, so `git status` in your tree shows only the handed-over files added, beside whatever was already uncommitted there.

## Report

The spec prover's block, then the bug prover's block, then:

```text
Recheck at <head>:
- kept - <spec 3, Q2, or attack 1 for the first `Attack` line> - <proof path> - `<command>` - <first failing line>
- dropped - <spec 3, Q2 or attack 1> - <why the rerun did not hold>
Restored: <tracked paths a prover changed, or "none">
Handed over: <paths added to your working tree, or "none">
Not handed over: <path - already in your tree, or "none">
Open questions:
- Q1 <the question's line, verbatim>
Worktrees: <absolute path of the spec prover's worktree>, <absolute path of the bug prover's worktree>
Remove with: git worktree remove --force <each path>
Uncommitted: <paths, or "none">
```

`Recheck` reads `- none` when no finding needed one, and `Open questions` reads `- none` when there were none.
A finding the recheck drops counts as dropped, whatever its prover's block says.
The worktrees stay, with every proof in them, for whoever reads the report.
This skill never stages, commits or pushes, and changes your working tree only by adding the handed-over files.
