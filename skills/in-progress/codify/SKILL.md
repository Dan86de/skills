---
name: codify
description: Turn review feedback that keeps coming back into standards entries, one-way doors and checker rules, proposed for your approval and written only once you approve.
disable-model-invocation: true
---

# Codify

Move recurring review lessons into the standards file, its `## One-way doors` section, and checker configs.
Propose, wait for approval, then write.
Never stage, commit, branch, push, or comment on a PR.

## 1. Pin the target and the window

The **target** is `.agents/coding-standards.md`, or `CODING_STANDARDS.md` when only that exists.
Never `CONTRIBUTING.md`.

The **window** takes at most one argument:

- a PR number: that PR alone, merged or not
- `--since <YYYY-MM-DD>`: PRs merged on or after that date
- nothing: PRs merged after the newest default-branch commit whose subject starts with `Codify`, else the 10 most recently merged

With no GitHub access or an empty window, continue on the user's input alone.

## 2. Ask the user

Show the window and its PRs (at most 20), then ask exactly this and wait:

> Which review comments did you catch yourself making, in these PRs or anywhere lately?

Each comment is a finding sourced `stated <today's date>`.

## 3. Gather findings

From each PR:

- human comments (conversation, review, inline), skipping bots and bare approvals
- review findings left open (such as `Open:` lines) in the PR body and commit bodies, plus fixed ones under an `Address review` commit subject or PR heading, never review-change `Fixed:` lines
- commits pushed after merge that only the PR body describes, counted once

## 4. Turn findings into rules

Rewrite each finding as the rule it implies, in this repo's own words; one-off bugs, spec gaps and user-only decisions imply none.
Group narrowly: a reviewer reading only the rule must flag every finding in it.
A rule **recurs** when the user stated it or its findings span two or more PRs.

Drop a rule a checker already enforces, a generic smell that is not repo-specific, or one the target already states (a **sharpen** if findings show it is missed).
A surviving rule that does not recur goes on the **watching** list.

## 5. Choose where each recurring rule lands

First fit wins:

1. **check**: enable or tighten a rule an installed checker already ships; anything needing a new plugin, custom rule or test is a **follow-up**, never written
2. **one-way door**: a change reverting the code cannot undo, under `## One-way doors`
3. **standard**: everything else, under `## Rules`

A coding rule in a tracked `AGENTS.md` or `CLAUDE.md` is a **move**: deleted there, added to the target.
Process rules stay.

Above 40 entries under `## Rules`, pair every new standard with a proposed **cut** or merge.

## 6. Propose

```text
Codify: <window>, PRs <#a, #b> | your input: <n comments | none>
Target: <path> (<n rules | will be created>)

Proposed:
1. [standard | one-way door | sharpen <name> | move <file:line>]
   <the entry, exactly as it will be written>
2. [check] <config>: <change> - <sources>
3. [cut] <name> - <why>

Follow-ups, not written:
- <what to build> - <sources>

Watching, one PR only:
- <rule> - <source>
```

Sources are PR numbers or `stated <date>`; an empty section reads `- none`; an empty `Proposed` ends the run.
Otherwise ask exactly this and wait:

> Approve, edit, or drop each numbered item.
> Reply with the numbers and what to do with each.

## 7. Write what was approved

If the target is missing, create it from [references/new-standards-file.md](references/new-standards-file.md).

Every standard and one-way door is exactly two lines:

```markdown
- **<Short name>**: <the rule, one sentence, a must or a never where it is one>
  Why: <one sentence> (<sources>).
```

Keep the bold name short and unique: other skills cite it.
A sharpen replaces in place; a cut deletes.

If a checker config changed, run the project's check command once and report violations in existing code without fixing them.

## 8. Report

- changed files, from `git status --short`
- the check result, or `not run: no config change`
- follow-ups and watching list
- a commit message, `Codify: <#a, #b>`, which marks where the next window starts
- a warning if `git check-ignore <target>` says the target is gitignored
