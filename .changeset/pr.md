---
"dan86de-skills": minor
---

Add the `pr` skill to `in-progress/`.
It writes a branch's PR body as an attention call, a visual summary, harvested evidence and a Merge Danger section, with the one-way or two-way door judged by a fresh-context subagent against a built-in baseline plus a repo's own `## One-way doors` rules.
It updates the branch's existing PR body and sets one `attention: read`, `attention: spot-check` or `attention: skim` label, keeps everything it does not own in a collapsed build log, and never pushes, opens, merges or marks a PR ready.
`implement-slice` now calls it when it closes a branch, before marking the PR ready.
