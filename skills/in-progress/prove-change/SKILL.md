---
name: prove-change
description: Check a branch against its spec and attack its diff from contexts that did not write it, keeping only findings a failing test or driver proves. Use at a branch close, when the user asks whether a branch does what its spec says or wants its open `possible bug:` questions settled, or another skill needs the spec checked by someone other than the implementer.
---

The implementer checking its own branch against the spec agrees with itself.
This skill hands the branch to two provers that did not write it: a spec prover that walks the spec, and a bug prover that attacks the diff.
Each keeps a finding only when a test or driver it wrote fails at the branch `HEAD`.
It reports and hands over proofs; it fixes nothing.

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

   Each prover writes only in its own, so neither collides with the other, and nothing either adds reaches your tree.

4. **Run both provers at once**, each in its own fresh subagent: the spec prover with everything below the line in [references/spec-prover-brief.md](references/spec-prover-brief.md), and the bug prover with everything below the line in [references/bug-prover-brief.md](references/bug-prover-brief.md), placeholders filled and paths absolute.
   Start both before waiting on either.
   If your harness has no subagents, stop and tell the user to run this skill in a fresh session: the context that wrote the branch will agree with it.

5. **Check the spec prover's block**: it matches the brief's template, it has exactly one line per Behaviour entry of the spec, every `passing` line names a test or driver the prover ran, and every `missing` or `looks wrong` line names a proof file in the prover's worktree and the command that fails.
   Every `not asked for` line names diff lines and a spec line, and no proof or command.
   No line reports a departure a recorded deviation already names.

6. **Check the bug prover's block**: it matches the brief's template, and `Questions` has exactly one line per open question, each `proven` or `dropped`.
   Every `proven` line, in `Questions` or `Attack`, names a proof file in the prover's worktree and the command that fails; every `dropped` line gives one reason.
   `Attack` holds only bugs that no open question names, or `- none found` with what was attacked.

7. **Send back a block that misses** once, naming what failed; if it still fails, return it with a `Shape:` line after it.

## Report

The spec prover's block, then the bug prover's block, then:

```text
Open questions:
- Q1 <the question's line, verbatim>
Worktrees: <absolute path of the spec prover's worktree>, <absolute path of the bug prover's worktree>
Remove with: git worktree remove --force <each path>
Uncommitted: <paths, or "none">
```

`Open questions` reads `- none` when there were none.
The worktrees stay, with every proof in them, for whoever reads the report.
This skill never stages, commits or pushes, and never edits your working tree.
