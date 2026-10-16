---
name: retro
description: Turn review feedback that keeps coming back into standards entries, one-way doors and checker rules, proposed for your approval and written only once you approve.
disable-model-invocation: true
---

# Retro

Never write the same review comment twice.

A review comment fixes one PR.
The same comment on the next PR means the lesson lived only in a reviewer's head.
This skill moves recurring lessons to where the next review finds them on its own: the standards file the review-change skill reads, the `## One-way doors` section the pr skill reads, and the checker configs the project already runs.

It proposes, the user approves, and only then does it write.
It never stages, commits, branches, opens a PR, or comments on one.

## Step 1: Pin the target and the window

**The target** is the standards file this run writes to:

- `CODING_STANDARDS.md`, if it exists
- otherwise `.agents/coding-standards.md`, whether or not it exists yet

Never `CONTRIBUTING.md`: it is written for people, and review-change reads it last.

**The window** is the PRs this run reads.
It takes at most one argument, and with none it uses the last retro:

- a PR number: that PR alone, merged or not
- `--since <YYYY-MM-DD>`: every PR merged on or after that date
- nothing: every PR merged after the **last retro**, the newest commit on the default branch whose subject starts with `Retro`
  Find it with `git log --format='%H %cI %s' <default-branch>`, keeping the first line whose subject starts with `Retro`, and keep PRs whose `mergedAt` is later than its commit date.
  No such line means there is no last retro: take the 10 most recently merged PRs, by `mergedAt`, instead.

If the user passes both a PR number and `--since`, stop and ask which one they meant.

Find the repo's `<owner>/<repo>` with `gh repo view --json nameWithOwner`.
List merged PRs with `gh pr list --state merged --limit 100 --json number,title,mergedAt`, then filter to the window.
If there is no GitHub CLI, no GitHub remote, or the window is empty, say so and carry on to Step 2 anyway: what the user says is enough to run on.

## Step 2: Ask the user

Show how the window was chosen (the PR given, since a date, since the last retro at a SHA, or the last 10 merged) and list its PRs, number and title, at most 20, then `and <n> more`.
Then ask exactly this, and wait for the answer:

> Which review comments did you catch yourself making, in these PRs or anywhere lately?

Every comment in the answer is a finding with the source `stated <today's date>`.
An empty answer is fine; the report says so.

## Step 3: Gather the written evidence

For every PR in the window, read three kinds of evidence.

**Human comments.**
Read them through the API, which gives each author's type:

- conversation comments: `gh api repos/<owner>/<repo>/issues/<n>/comments --paginate`
- review bodies: `gh api repos/<owner>/<repo>/pulls/<n>/reviews --paginate`
- inline review comments: `gh api repos/<owner>/<repo>/pulls/<n>/comments --paginate`

Skip a comment whose `user.type` is `Bot` or whose login ends in `[bot]`.
Skip one that only approves, thanks, or asks for a rerun.

**Review findings left open.**
These come from an agent's review, such as the block review-change emits or a closing review of a whole branch.
Read them from the PR body and from the body of every commit in the PR, `gh api repos/<owner>/<repo>/pulls/<n>/commits --paginate`.
A finding counts when the review left it open, in any wording: an `Open:` line, or a finding described as skipped, left standing, not fixed, or left for the user to decide.
A finding the review fixed counts only in a commit whose subject starts `Address review`, or a PR body section whose heading starts `Address review`, because those were caught at the end of a branch, not at commit time.
The `Fixed:` lines of a review-change block never count: review-change already catches those at commit time.
A request the user made during the review, such as a new feature, is not a finding.

**Commits pushed after the merge.**
A commit pushed to the branch after the PR merged is not in the PR's commit list, but the PR body may describe it.
So read both the commit bodies and the PR body, and count a finding they both describe once.
When the PR body names a commit SHA that is not in the PR's commit list, read that commit with `git show <sha>` if it exists locally.

Keep a working list of findings for yourself, one line each: what was wrong, the file if it names one, the PR number, and the source kind.
The user sees it only through the sources in Step 6.

## Step 4: Turn findings into rules

Rewrite each finding as the rule it implies, stated about this repo: its modules, its patterns, its words.
A finding that is a one-off bug, a spec gap, or a decision only the user can make implies no rule, and leaves here.
A finding can carry both: keep the part that implies a rule, and drop the rest.

Group findings that imply the same rule.
A group is right when a reviewer reading only the rule's entry would flag every finding in it, and would not need an "or" between unrelated mechanisms to do so.
If the rule needs a list of unrelated cases to cover its findings, it is several rules, each with fewer sources.
Group narrowly: a broad rule makes anything look recurrent, and recurrence is the only thing standing between one PR's accident and a rule for every PR.

A rule **recurs** when either:

- the user stated it in Step 2, or
- its findings come from two or more different PRs; two commits in one PR are one PR

Then drop or reshape every rule, recurring or not, against what already exists:

- **the target**, if it exists: a rule an entry already states becomes a **sharpen** of that entry, but only when the findings show the entry is being missed or misread; otherwise drop it
- **checker configs**: drop a rule a checker already enforces
  Find them by following the check script the project actually defines, such as a `check` script in `package.json`, to each linter, formatter and type-checker it runs, and read the config each one loads; if the agent instructions describe the command differently, the script wins.
- **general smells**: a rule that only restates a general smell, such as duplicated code or a misleading name, adds nothing, because review-change already has it; keep it only if it names something specific to this repo or makes the rule a must or a never

A rule that survives and does not recur goes on the **watching** list, written as the rule in one short line with its one source, and nothing is proposed for it.

## Step 5: Choose where each rule lands

Walk this ladder for each recurring rule, and stop at the first rung that fits:

1. **Check**: a rule an installed checker already ships, such as an ESLint rule from a plugin already in the config, enabled or tightened in that config. A rule that needs a new plugin, a new dependency, a custom rule, or a new test is a **follow-up** instead: proposed as a task, never written.
2. **One-way door**: a rule about a change that cannot be undone by reverting the code, such as a data shape, a deletion, or an outward effect. It goes under `## One-way doors` in the target.
3. **Standard**: everything else. It goes under `## Rules` in the target.

**Agent instructions.**
List every `AGENTS.md` and `CLAUDE.md` the repo tracks, with `git ls-files`.
Read the ones at the root, and, only if there are others, the ones in a directory or an ancestor of one that holds a file the window's PRs changed (`gh pr view <n> --json files`).
Follow the files they import, such as a line reading `@AGENTS.md`.
Each coding rule found there is a **move**: deleted from that file and added to the target, never copied.
A process rule, such as which command to run or what a PR must contain, stays where it is.
If a proposed standard overlaps a process rule, say so in the item, so the user can decide whether both should stand.

**The budget.**
Count the entries under `## Rules` in the target, plus every standard this run proposes.
Above 40, every new standard comes with a proposed **cut** or merge of an existing entry, and the user picks.

## Step 6: Propose

Show the proposal in the conversation, in this shape:

```text
Retro: <how the window was chosen>, PRs <#a, #b, ...> (<n> PRs) | your input: <n comments | none>
Target: <path> (<exists, n rules | will be created>)

Proposed:
1. [standard]
   - **<Short name>**: <the rule>
     Why: <why> (<sources>).
2. [sharpen] <the existing entry's name>
   <the new entry, both lines, as above>
3. [one-way door]
   <the entry, both lines, as above>
4. [check] <config file>: <the change> - <sources>
5. [move] <file:line>
   <the entry, both lines, as above>
6. [cut] <the existing entry's name> - <why it can go>

Follow-ups, not written:
- [custom check | test] <what to build> - <sources>

Watching, one PR only:
- <rule> - <source>
```

Every entry shows both of its lines exactly as Step 7 will write them, and its sources live in its `Why:` line.
Sources are PR numbers, such as `#2, #6`, or `stated <date>`.
An empty section reads `- none`.
If `Proposed` is empty, say so, show the rest, and stop: there is nothing to approve.

Then ask exactly this, and wait:

> Approve, edit, or drop each numbered item. Reply with the numbers and what to do with each.

Nothing is written until the user answers.

## Step 7: Write what was approved

Write each approved item into the working tree, with the user's edits.

A target that does not exist is created with this skeleton, then filled:

```markdown
# Coding standards

Read by the review-change skill on every review, and by the pr skill for `## One-way doors`.
Each entry is a rule and why it exists, with the PRs or the statement it came from.

## Rules

## One-way doors
```

Every standard and one-way door entry is exactly two lines:

```markdown
- **<Short name>**: <the rule, one sentence, stated as a must or a never where it is one>
  Why: <one sentence> (<sources>).
```

The bold name is how review-change and pr cite the rule, so keep it short and unique within the file.
No examples longer than one line, and no sub-bullets.
Append new entries to the end of their section; a sharpen replaces its entry in place, and a cut deletes it.

If any approved item edited a checker config, run the project's own check command once: take it from the agent instructions first, then the package or build scripts, then the CI workflow.
If it fails on code this run did not write, leave the config change in place and report how many violations it found and where; fixing them is not this skill's job.

## Step 8: Report

- each file changed, from `git status --short`, one line each
- the check result, or `not run: no config change`
- the follow-ups and the watching list, unchanged from Step 6
- that the user's input was empty, if it was
- a commit message to use: `Retro: <#a, #b, ...>`, and that the next run starts after this commit only if it lands on the default branch with that subject
- that the target is gitignored, if `git check-ignore <target>` says it is, because then review-change in a fresh clone will not find it

## Rules that do not bend

- Nothing is written before the user approves it, item by item.
- Never stage, commit, branch, push, open a PR, or comment on one.
- Every proposed item cites two PRs or the user's own statement. A single PR is watching, never a proposal.
- A coding rule leaves `AGENTS.md` or `CLAUDE.md` when it moves. It is never in two places.
- Never write a custom check or a test, and never fix the violations an enabled check finds.
