---
name: review-change
description: Review a change against the repo's own coding standards in a fresh context and fix what is safe. Use before a commit or PR, when the user says "review this", or another skill needs a standards pass.
---

The implementer makes it work, this skill makes it good, in a context that did not write it.
The reviewer's default output is a **fix**; it reports only what it may not fix.
It judges standards and **fit** with the rest of the codebase, not the spec, and passes on a bug only as a question.

Arguments: an optional fixed point, an optional `--no-check`, then optional standards paths.

## Steps

1. **Pin the diff.**
   The fixed point defaults to the merge-base of `HEAD` and the default branch; `HEAD` means uncommitted work only.
   Resolve it with `git rev-parse --verify <ref>^{commit}` and stop if it fails.
   The change is everything from the fixed point to the working tree, untracked files included: `git diff --name-only <fixed-point>` plus `git ls-files --others --exclude-standard`.
   Drop untracked dependency installs and build output, and remember them for the report.
   An empty list ends the skill: say there is nothing to review.

2. **Find the standards**, all of them, in precedence order: paths passed as arguments, `.agents/coding-standards.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md` and any other doc on how to write code here (not a user manual, product doc, or brand guide).
   Also collect the linter, formatter and type-checker configs the project's check command uses (not build or test-runner configs), and every `AGENTS.md` and `CLAUDE.md` at the root or in a touched directory.
   No standards at all is normal: the review runs on the baseline.

3. **Run one reviewer** in a fresh subagent, passing everything below the line in [references/reviewer-brief.md](references/reviewer-brief.md) with placeholders filled and paths absolute.
   If your harness has no subagents, stop and tell the user to run this skill in a fresh session: the context that wrote the change will agree with it.
   Check the block it returns: it matches the template, every `file:line` points at the code it describes in the working tree, and it is at most 400 words.
   On a miss, send it back once naming what failed; if it still fails, return it with a `Shape:` line after `Dropped:`.

4. **Check the fixes**, unless the call carried `--no-check` (a caller running its own gate).
   If the reviewer fixed anything, run the project's typecheck, lint and tests once, taken from the agent instructions, then the package scripts, then CI.
   Leave fixes in place when a check fails; the next step's owner decides.

## Report

The reviewer's block, then:

```text
Checks: <command> pass | <command> fail: <first failing step> | not run: no fixes | not run: --no-check
Dropped: <paths, or "none">
```

The block is plain text so a caller can paste it into a commit or PR unchanged.
This skill always finishes; what a `blocks` finding stops is the caller's call.
It never stages, commits, pushes, or comments on a PR.
