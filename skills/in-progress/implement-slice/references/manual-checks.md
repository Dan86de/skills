# Manual checks

The checklist a person works through at the ready PR, written against the finished branch so its steps describe the code they will test.
One empty commit holds it, and pr-brief renders the latest one as the PR's `## Before you merge`.

## Writing it

Take every `Awaiting sign-off:` item of a commit carrying `Slice: <id>`, tagged with that id.
A signed-off `hitl` slice's items sit in its `Slice-Pending` commit and were already confirmed, so they stay out.

For each item, write two things from the slice's diff, the spec and the feature map:

- **Reach**: the exact command or URL that gets a person there, starting from a fresh checkout of the branch.
- **Steps**: numbered actions, each exact enough to perform without opening the code, ending on what to judge.

Then follow each reach path with the verify skill where it can (call the Skill tool with its name), and leave the judging to the person:

- `pass`: nothing to add.
- `fail`: the product is broken, so this is a gap in the close.
  Fix it, pass the gate, commit as `Address review` with proof, and write the checklist again.
  If you cannot fix it, stop like step 6: the PR stays a draft.
- `not driven`: the run cannot reach it, such as a deployed preview.
  Keep the steps and add `(reach not confirmed)` to the reach line.

## Order

Most dependents first, counting every slice that transitively reaches the item's slice through `blocked_by`.
Ties go in slice order, and items of one slice stay in `done.manual` order.
The order is the only signal, so write no note about it on the item.

## Committing it

Commit and push with `git commit --allow-empty`, the count in the trailer:

```text
Manual checks

- S3: <check>
  Reach: <command or URL, then where to go>
  1. <step>
  2. <step>

Manual-Checks: 2
```

A later commit with this trailer replaces the checklist whole.
A rework adds `Retest: <ids>` beside it, per [rework.md](rework.md).
