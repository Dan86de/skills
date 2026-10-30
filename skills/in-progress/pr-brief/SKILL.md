---
name: pr-brief
description: Write a PR body that tells reviewers how much attention the branch needs, and label the PR. Use when a branch is ready for review, the user asks to write the PR description or how risky a PR is, or another skill closes a branch.
---

Review every one-way door; skim two-way doors with a localized blast radius.
Touch only the PR's body and `attention:` labels; never push, open, merge, mark ready, or run checks.

## 1. Pin the branch

Arguments: optional base ref (default: merge-base with the default branch), then optional spec path.
Stop if `<base>..HEAD` is empty or unresolvable.
Describe commits only.

Run `gh pr view --json number,url,body,headRefOid,labels,state`.
If the open PR's head is not `HEAD`, stop: the branch needs pushing.
With no open PR, `gh` or remote, print the body instead of applying it.

## 2. Gather

Read the diff, `git log --reverse --format='%h %s%n%n%b' <base>..HEAD`, the body, the spec (argument, else one the body or a commit names), `spec/glossary.md` (else root `GLOSSARY.md` or `CONTEXT.md`), and `pull_request_template.md` (`.github/`, `docs/` or root, any case).
One-way rules: [references/one-way-doors.md](references/one-way-doors.md) plus any `## One-way doors` section in `.agents/coding-standards.md`, `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

Harvest:

- **findings**: `Open:` lines from review blocks, with SHA, except those whose outcome is `fixed` (outcomes as review-change's Report defines them; a `stands` finding stays, with its reason); every `Deviations:` item (a spec departure the implementer chose) and anything left for the reviewer is a `[question]`
- **pending sign-offs**: `Awaiting sign-off:` items of a `Slice-Pending: <id>` commit with no `Slice: <id>` commit; off a slice branch, items with no later commit subject starting `Sign off`
- **proof**: verify runs, passing tests, before and after output, images

## 3. Start the assessor

Start one fresh-context subagent with [references/assessor-brief.md](references/assessor-brief.md) below the line, filled in, and write steps 4 and 5 meanwhile.
Without subagents, run it yourself after step 5, marked self-graded.
If its block breaks the template or cites a wrong `file:line` at `HEAD`, send it back once.

## 4. Summary

One user-facing sentence, then at most two minimal visuals (pseudocode, a tree, an idea-shaped `diff`, or Mermaid).

## 5. Evidence

Harvested proof only, strongest first: before and after output, a verify run id, a branch test as pseudocode.
One **Before:** / **After:** pair (Before may be words), then at most three proof lines.
If all you have is "checks passed", write `Evidence: none` followed by that line.
Run nothing to produce evidence, and claim a test failed before the change only when a commit shows it did.

## 6. Attention level

| Level | Any of these |
| --- | --- |
| `read` | one-way door; a `[blocks]` finding or `possible bug` question open at `HEAD`; a pending sign-off; `Evidence: none`; a self-graded verdict |
| `spot-check` | two-way with wide blast radius; any other `[question]` open at `HEAD`; over the step 7 budget |
| `skim` | none of the above |

Highest match wins; `[judgement]` findings never count; every reason cites its trigger.

## 7. Assemble

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

- `Read first` is the assessor's list; on `skim` drop it and the reason reads `- two-way, localized, with evidence`.
- Fill remaining template headings; tick checklists only on evidence.
- The build log holds the rest of the existing body verbatim; on a rerun, unwrap it first so nothing nests, and omit it when empty.
- Above the build log, stay within about 40 lines, else add `too big to summarise in one screen` as a `spot-check` reason.

## 8. Apply

`gh pr edit <number> --body-file <tmpfile>`, then make `attention: <level>` the PR's only `attention:` label, creating `attention: read`, `attention: spot-check` and `attention: skim` if missing.

## 9. Report

PR or printed body, level and reasons, self-grading, uncommitted changes, missing spec.
