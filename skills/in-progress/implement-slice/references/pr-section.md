# PR section

Each slice commit gets one section under `## Slices` in the PR body.
The commit body is the record; the section renders it for a reader on GitHub, so it is Markdown, and each paragraph or list item is one physical line.
Build it from the slice's commits alone (its own and any sign-off), so rendering it twice gives the same section.

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
- **Needs you**, in this order:
  - each `Awaiting sign-off:` item as `- [ ] <item>`
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
