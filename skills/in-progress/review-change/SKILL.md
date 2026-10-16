---
name: review-change
description: Review a change against the repo's own coding standards in a fresh context, fix what is safe to fix in the working tree, and report the rest as a fixed-shape block. Use when a change is about to be committed or a branch is about to become a PR, when the user says "review this", "review my changes", "check this against our standards", or "make it good", and when another skill needs a standards pass before it commits.
---

# Review Change

Make working code good, in a context that did not write it.

Implementing is overloaded: one context explores, edits, and debugs, and standards loaded into it compete with all three.
Reviewing is underloaded: it gets a diff, so it can afford every rule the repo has.
That split is the whole design: the implementer makes it work, this skill makes it good.

The reviewer's default output is a fix, not a comment.
Every finding it reports instead is work handed to a person, so it reports only what it is not allowed to fix.

This skill judges **standards** only.
It does not check the change against a spec or write a PR body, and it does not hunt bugs, though it passes on one it trips over.

## Step 1: Pin the diff

Arguments: an optional fixed point, then an optional `--no-check`.

The fixed point is what the change is measured from:

- none: the merge-base of `HEAD` and the default branch
- `HEAD`: uncommitted work only
- any other ref: that ref

Resolve it with `git rev-parse --verify <ref>^{commit}`.
If it does not resolve, stop and say so.

The change is everything between the fixed point and the **working tree**: committed, staged, unstaged, and untracked.
List the changed files with `git diff --name-only <fixed-point>` plus `git ls-files --others --exclude-standard`.
Drop any untracked path that is a dependency install or build output, such as a `node_modules` link git failed to ignore.
Dropped paths leave the list for good: the reviewer never sees them, and the report names them.

If the list is empty, stop and say there is nothing to review.
Do not start a reviewer for an empty diff.

## Step 2: Find the standards

Collect every one of these that exists, not just the first.
The order is precedence: when two disagree, the earlier one wins.

1. a path passed as a further argument
2. `CODING_STANDARDS.md`
3. `.agents/coding-standards.md`
4. `CONTRIBUTING.md`, and any doc that tells contributors how to write or structure code; a user manual, a product doc, or an art or brand guide is not one

Separately, collect:

- **checker configs**: every linter, formatter, and type-checker config the project's check command uses, wherever it lives, so the reviewer can skip what they already enforce; build and test-runner configs are not checkers
- **agent instructions**: every `AGENTS.md` and `CLAUDE.md` at the root or in a directory the change touches, plus any file they import; skills are not agent instructions

The reviewer reads agent instructions for coding rules only, and ignores process rules such as which command to run or what a PR must contain.
A coding rule found there counts as a standard, and the reviewer also flags it as misplaced: those files load into every implementing agent, which is exactly where standards do not belong.

When no standards file exists and the agent instructions hold no coding rules, the review runs on the baseline alone.
That is a normal outcome.

## Step 3: Run the reviewer

The review runs in a subagent with a fresh context.
Start exactly one, and pass it everything below the line in [references/reviewer-brief.md](references/reviewer-brief.md) with every placeholder filled in, paths absolute.

If your harness cannot start a subagent, stop.
Tell the user to run this skill with the same arguments in a fresh session, and end the turn.
Never review in the context that wrote the change: it already believes the code is right, and the review would agree with it.

The reviewer edits the working tree for the fixes it applies and returns the report block.
It never stages, commits, or pushes.

When the block comes back, check it:

- it matches the template in Step 5, line for line, with nothing added
- every `file:line` points at the code the finding describes, in the working-tree file; open each one and look
- it is at most 400 words

If any of these fail, send it back to the same reviewer once, naming what failed.
If the second block still fails, return it anyway and add a `Shape:` line after `Dropped:` naming what is still wrong.

## Step 4: Check the fixes

Skip this step when the call carried `--no-check`.
A caller passes that when it runs its own gate after the review, as an implementing skill does.

If the reviewer applied any fix, run the project's own check command once, after the reviewer's last edit, send-back included: typecheck, lint, and tests.
Take it from the agent instructions first, then the package or build scripts, then the CI workflow.

Never revert a fix because a check failed.
Leave the fixes in place for whoever owns the next step.

## Step 5: Report

Return the block, then one line for the check, then one line for anything dropped in Step 1.

```text
Review: <fixed-point>..working tree, <n> files
Standards read: <paths, or "baseline only">

Fixed:
- <rule or smell> - <file:line> - <what changed>

Open:
- [blocks] <rule or smell> - <file:line>[, <file:line>] - <why>
- [judgement] <rule or smell> - <file:line>[, <file:line>] - <why>
- [question] <file:line> - <the question>

Outside the diff: <one line, or "none">
```

```text
Checks: <command> pass | <command> fail: <first failing step> | not run: no fixes | not run: --no-check
Dropped: <paths, or "none">
```

`<n>` counts the files in the Step 1 list after dropping.
An empty section reads `- none`.
`Open` lists `blocks` first, then `judgement`, then `question`.
The blocks are plain text so a caller can paste them into a commit body or a PR unchanged.

## Severities

- **blocks**: a test lie in a test that is the only proof of the behaviour its own name describes, or a breach of a rule the repo's standards state as a must or a never.
- **judgement**: every other standards or baseline finding.
- **question**: anything the reviewer could not settle from the code, including a suspected bug, written as `possible bug: ...`.

This skill never refuses to finish because of a `blocks` finding.
What a `blocks` finding stops is the caller's decision.

## Rules that do not bend

- One reviewer, in a fresh context, or no review.
- Every finding points at a line the diff touches. A finding about something missing points at the code that lacks it. Anything about untouched code goes on the one `Outside the diff:` line, and is never fixed.
- Fix everything the reviewer brief allows. Report only the rest.
- Never stage, commit, push, or comment on a PR.
- Never report what a checker config already enforces.
