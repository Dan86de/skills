---
name: pr-brief
description: Write a branch's PR body so a reviewer can tell at a glance how much attention it needs, with a visual summary, harvested evidence, and a one-way or two-way door call made in a fresh context, then put the body and an attention label on the branch's existing PR. Use when a branch is ready for review, when the user says "write the PR body", "update the PR description", "how risky is this PR", or "is this ready to merge", and when another skill closes a branch and needs its PR described.
---

# PR Brief

Write the PR body that tells the reviewer where to spend attention.

A reviewer's scarcest resource is attention, and most PR bodies spend it.
A ledger of proof, a wall of prose or a bare "tests green" makes the reviewer read the whole diff before they know whether it needed a skim.
This skill answers that question first, shows its working, and then gets out of the way.

The rule it serves: review every one-way door, skim two-way doors whose blast radius is localized.

This skill writes the body and the label.
It does not push, open, merge, or mark a PR ready, it never runs the project's checks, and it does not review code.

## Step 1: Pin the branch

Arguments: an optional base ref, then an optional spec path.

The base defaults to the merge-base of `HEAD` and the default branch.
Resolve it with `git rev-parse --verify <ref>^{commit}`, and stop if it does not resolve.
The change is the commits in `<base>..HEAD`.
If there are none, stop and say there is nothing to describe.

The body describes commits only.
If the working tree has changes, carry on and say so in the report.

Find the open PR whose head is the current branch with the GitHub CLI: `gh pr view --json number,url,body,headRefOid,labels,state`.
On a detached `HEAD` there is no branch, so there is no PR to update.

- **There is one, it is open, and its head is `HEAD`.** This run will update it.
- **There is one, and its head is not `HEAD`.** Stop: the PR shows a different diff from the one you would describe. Say the branch needs pushing, and never push it yourself.
- **There is none, it is merged or closed, or there is no GitHub CLI or remote.** Carry on, and print the body at the end instead of applying it.

## Step 2: Gather the inputs

Read, and keep for later steps:

- **the diff**: `git diff --stat <base>..HEAD` and `git diff <base>..HEAD`
- **the commit messages**: `git log --reverse --format='%h %s%n%n%b' <base>..HEAD`
- **the existing PR body**, if there is a PR
- **the spec**: the path argument; otherwise a spec path the PR body or a commit message names, resolved from the repo root; otherwise none
  A named spec that does not exist, such as a gitignored file in a fresh clone, counts as none, and the report says so
- **the glossary**: a `GLOSSARY.md` or `CONTEXT.md` at the root, if one exists, so the body uses the repo's own words
- **the PR template**: the first of `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/pull_request_template.md`, `pull_request_template.md` that exists
- **the one-way rules**: [references/one-way-doors.md](references/one-way-doors.md), plus the `## One-way doors` section of each of `CODING_STANDARDS.md`, `.agents/coding-standards.md` and `CONTRIBUTING.md` that has one; a file without that section contributes nothing

From the commit messages and the existing body, also collect:

- **review findings**: every `Open:` line from every review block, such as the one the review-change skill emits, with the short SHA of the commit or the PR section it came from
  An item a commit or the body explicitly leaves for the reviewer to decide, in any wording, is a finding too: record it as a `[question]`
- **pending sign-offs**: on a slice branch, every `Awaiting sign-off:` item of a commit carrying `Slice-Pending: <id>`, when no commit in the range carries `Slice: <id>`
  Elsewhere, every `Awaiting sign-off:` item with no later commit whose subject starts `Sign off`
- **proof**: verify-run lines and the checks they name, test names a commit says pass, before and after output, and image links

## Step 3: Start the assessor

The door call runs in a subagent with a fresh context, because the context that wrote a change grades it kindly.
Start exactly one, and pass it everything below the line in [references/assessor-brief.md](references/assessor-brief.md) with every placeholder filled in, paths absolute.
Write the Summary and Evidence (Steps 4 and 5) while it runs.

If your harness cannot start a subagent, follow the brief yourself after Step 5, and mark the verdict self-graded.
Do not stop: an honest self-graded body beats no body.

When its block comes back, check that it matches the brief's template.
Open each `file:line` under `Matched`, `Read first` and `Still open`, and check that it points at the code it describes at `HEAD`.
If either fails, send it back once, naming what failed.

## Step 4: Write the Summary

One sentence, at most, saying what changed for the person who uses the product.
Then the smallest visual that makes the change clear, at most two:

- **pseudocode** for a change in logic
- **a call tree** for a change in what calls what at runtime
- **a component or module tree** for a change in structure, with the state and boundaries that matter
- **a shallow file tree** for a move or a refactor, marking added, moved and removed files
- **a `diff` block shaped to the idea**, not copied from the diff: the before and after of a call tree, a layout, or a control flow
- **a Mermaid diagram** for an interaction between parts or a data flow; it renders on GitHub, but the text forms above read the same everywhere, so prefer them

Keep only the names, files and boundaries that carry the point.
A visual that lists every changed file has stopped summarising.

## Step 5: Write the Evidence

Evidence is something a reviewer can check, from Step 2's proof.
Never run anything to produce it.

In order of strength:

1. a screenshot or output from before and after the change
2. a verify check that names what it saw, with its run id
3. a test the branch adds or changes, shown as pseudocode of what it asserts, with its file

Lead with one **Before:** and **After:** pair, then at most three further proof lines.
The **Before:** line may describe the old behaviour in words, taken from the spec or a commit message.
The **After:** line and every further line must be proof from the list above.
Do not claim a test failed before the change unless a commit shows that it did.

A line that only says the checks passed is a claim, not evidence.
Keep it, but if it is all there is, the section reads `Evidence: none`, followed by that line.

## Step 6: Decide the attention level

Take the highest level any row matches.

| Level | Any of these |
| --- | --- |
| `read` | the door is one-way; a `[blocks]` finding or a `possible bug` question still open at `HEAD`; a pending sign-off; `Evidence: none`; a self-graded verdict |
| `spot-check` | a two-way door with a wide blast radius; any other `[question]` still open at `HEAD`; a Summary and Evidence that do not fit the budget in Step 7 |
| `skim` | none of the above |

`[judgement]` findings never raise the level.
Every reason you list cites what triggered it: a `file:line`, a rule from the assessor's block, its `Blast radius` line, a finding, or a sign-off item.

## Step 7: Assemble the body

In this order:

```markdown
## Attention

**<read | spot-check | skim>**
- <reason> - <file:line, rule, finding, or sign-off item>

Read first:
- <file:line> - <why>

## Summary

<one sentence, then the visual>

## Evidence

**Before:** <...>
**After:** <...>

## Merge Danger

**Door:** <one-way | two-way> - <why>
**Blast radius:** <localized | wide> - <what it reaches>
**One-way rules checked:** <rule names>; matched: <rule - file:line, or none>
**Graded by:** <fresh context | self-graded>

<the template's remaining headings>

<details>
<summary>Build log</summary>

<everything else>

</details>
```

`Read first` is the assessor's list, at most three lines, and is omitted on `skim`.
Under `skim`, the reasons line reads `- two-way, localized, with evidence`.

**The template's remaining headings.** Every heading of the PR template that the four sections above do not already answer, filled in from the same inputs.
Never drop a template heading.
Leave a checklist item unticked unless the evidence proves it.

**The build log.** Everything in the existing body that this skill does not own, kept verbatim and in its order: text before the first heading, and every section not listed above.
Keep it even where it repeats the Summary or describes commits outside the range: the build log is a record, not a description of the diff.
A slice ledger and a branch review live here.
On a rerun, unwrap the previous `Build log` first and replace this skill's own sections, so nothing is wrapped twice and nothing is duplicated.
With no other content, omit the block.

**The budget.** Everything above the build log fits in about 40 lines of Markdown source, code fences included.
If an honest Summary and Evidence cannot, keep the most important part, and add `too big to summarise in one screen` as a `spot-check` reason.

## Step 8: Apply it

With a PR from Step 1:

1. Write the body to a temporary file and run `gh pr edit <number> --body-file <file>`.
2. Make sure the three labels exist: `attention: read`, `attention: spot-check`, `attention: skim`.
   Create any that are missing with `gh label create`.
3. Remove every other `attention:` label from the PR and add the one for this level.

Without one, print the body in full.

Invoking this skill permits editing the body and the `attention:` labels of the branch's own PR, and creating those three labels.
It permits nothing else.

## Step 9: Report

- the PR, or that the body was printed and why
- the level and its reasons, one line each
- that the verdict was self-graded, if it was
- uncommitted changes the body does not describe, if there were any

## Rules that do not bend

- The door call comes from a fresh context, or it is marked self-graded and the level is `read`.
- Every reason and every `Read first` line points at something the reviewer can open.
- No evidence is written as `Evidence: none`, never softened into a claim.
- Never push, open, merge, or mark a PR ready, and never run the project's checks.
- Never drop content from an existing body: what this skill does not own goes in the build log, verbatim.
