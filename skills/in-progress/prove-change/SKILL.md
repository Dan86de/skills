---
name: prove-change
description: Check a branch against its spec from a context that did not write it, keeping only findings a failing test or driver proves. Use at a branch close, when the user asks whether a branch does what its spec says, or another skill needs the spec checked by someone other than the implementer.
---

The implementer checking its own branch against the spec agrees with itself.
This skill hands the branch to a prover that did not write it, and keeps a finding only when a test or driver the prover wrote fails at the branch `HEAD`.
It reports and hands over proofs; it fixes nothing.

Arguments: the spec's path, then an optional fixed point.

## Steps

1. **Pin the branch.**
   The fixed point defaults to the merge-base of `HEAD` and the default branch; pass one when the default branch already holds the branch, as on a replay.
   Resolve both with `git rev-parse --verify <ref>^{commit}` and stop if either fails, or if `git log <fixed-point>..HEAD` is empty.
   The prover sees committed work only: name any uncommitted change in the report, and do not prove it.
   Stop if `git check-ignore -q .scratch/` fails: the prover's worktree goes there and must stay out of your tree's status.
   Stop if the spec has no `## Behaviour` section with numbered entries.

2. **Collect the inputs**: the spec, the changed files from `git diff --name-only <fixed-point> HEAD`, the agent instruction files at the root, and the project's verify skill and its feature map if it has them.
   The verify skill is `.agents/skills/verify/`, else a `verify` skill in a harness skills folder; the feature map is `docs/manual/`.
   Also collect the **recorded deviations**: every `Deviations:` item in `git log --format=%B <fixed-point>..HEAD`, skipping `- none`.
   They are input, not findings: each already says what the branch does instead and why.

3. **Make the spec prover's worktree** at `HEAD`, detached, under the run's own folder:

   ```bash
   prove=.scratch/prove-change/$(date +%Y%m%d-%H%M%S)-$(printf '%04x' $RANDOM)
   git worktree add --detach "$prove/spec" HEAD
   ```

   The prover writes only there, so nothing it adds reaches your tree.

4. **Run the spec prover** in a fresh subagent, passing everything below the line in [references/spec-prover-brief.md](references/spec-prover-brief.md) with placeholders filled and paths absolute.
   If your harness has no subagents, stop and tell the user to run this skill in a fresh session: the context that wrote the branch will agree with it.

5. **Check the block it returns**: it matches the brief's template, it has exactly one line per Behaviour entry of the spec, every `passing` line names a test or driver the prover ran, and every `missing` or `looks wrong` line names a proof file in the prover's worktree and the command that fails.
   Every `not asked for` line names diff lines and a spec line, and no proof or command.
   No line reports a departure a recorded deviation already names.
   On a miss, send it back once naming what failed; if it still fails, return it with a `Shape:` line after the block.

## Report

The prover's block, then:

```text
Worktree: <absolute path of the spec prover's worktree>
Remove with: git worktree remove --force <that path>
Uncommitted: <paths, or "none">
```

The worktree stays, with every proof in it, for whoever reads the report.
This skill never stages, commits or pushes, and never edits your working tree.
