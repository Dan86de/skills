# PR section

Each slice commit gets one section under `## Slices` in the PR body.
The commit body is the record; the section renders it for a reader on GitHub, so it is Markdown, and each paragraph or list item is one physical line.
Build it from the slice's commits alone (its own, any sign-off and any rework), so rendering it twice gives the same section.

## Template

````markdown
### <status> <id> - <title> · [<short SHA>](<commit URL>)

[Behaviours <numbers>](<spec URL>) · <n> checks pass · <project check commands> pass

**Needs you**
- <item>

**Stands**
- <item>

<details>
<summary>Proof and review</summary>

| Check | Proof | Result |
| --- | --- | --- |
| <verify or test item> | <check heading or test file> | pass |

Verify run `<run id>` · reviewed <n> files against <standards file names>

**Fixed in review**
- <item>

**Outside the diff:** <the line>

</details>
````

## Filling it

- **Status**: `✅` when a commit on the branch carries `Slice: <id>`, else `⏳`.
  A sign-off commit also ticks the `Awaiting sign-off:` items and adds `Signed off in [<short SHA>](<commit URL>).` below the heading.
  A rework commit adds `Reworked in [<short SHA>](<commit URL>): <what failed>.` below the heading, one line per rework.
- **Needs you**, in this order:
  - each `Awaiting sign-off:` item of a `Slice-Pending` commit as `- [ ] <item>`; a done slice's items belong to `## Before you merge` instead, so there is one place to tick them
  - each deviation as `**Deviation:** <what you did instead>, not <spec line or behaviour>: <why>`
  - each unmarked `question` as `<link> <the question>`
- **Stands**: each `stands` finding as `<link> <rule or smell>: <why>. Kept: <stands reason>`.
- **Fixed in review**: each `Fixed` line and each `fixed` `Open` line as `<link> <what changed>`.
- **Links**: each `file:line` becomes `[<file name>:<line>](https://github.com/<owner>/<repo>/blob/<full SHA>/<path>#L<line>)`, pinned to the slice's commit so later slices do not shift the lines.
  The commit URL is `https://github.com/<owner>/<repo>/commit/<full SHA>`, the spec URL is the spec file's blob URL at that commit, and `<owner>/<repo>` comes from `gh repo view --json nameWithOwner`.
- **Empty parts**: leave out a heading whose list is empty and the `Outside the diff` line when it is `none`.
  The section never says `none`; a slice with nothing for the reader is its two top lines and the folded proof.

## Branch review

The `## Branch review` section renders the `Address review` commit in the same shape, without the `###` line or the checks table.
Its top line is `[<short SHA>](<commit URL>) · <project check commands> pass`.
Each `Proved:` line above its `Dropped` renders by its outcome, its proof path linked as a `file:line` is: `fixed` under **Fixed in review** as `<spec 3, Q2 or attack 1> <what changed>, proved by <proof link>`, and `stands` under **Stands** as `<spec 9> not asked for: <diff links>. Kept: <stands reason>`.
Each `Deleted proofs` line goes last under **Needs you** as `**Deleted proof:** <proof path>: <why it proves nothing>`.
Each line under `Dropped` renders in a second fold after the first, one line each, so the reader can judge whether the provers drop too much:

````markdown
<details>
<summary>Dropped by prove-change: <n></summary>

- <spec 5, Q3, attack 1 or attack> <link> <what it states> Why: <why it was dropped>

</details>
````

`<n>` counts the lines.
`<link>` is a question's first `file:line`, pinned to the oldest commit whose message holds the question, since the question describes the code there and a later commit may have moved it; any other line leaves it and its space out.
For a question, `<what it states>` is its text between `possible bug: ` and ` => stands: not proven, `, and `<why it was dropped>` the text after that.
Any other line reads `<id> - <what it states> - <why it was dropped>`, its parts placed in the template without the ` - ` between them, and a `deleted proof` reason renders as that proof's `Deleted proofs` reason.
`<what it states>` ends in a period when it has no closing punctuation of its own.
The fold is left out when `Dropped` reads `- none`.
