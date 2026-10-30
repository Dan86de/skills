---
"dan86de-skills": minor
---

Add the in-progress run-feature skill: a zero-dependency runner that loops implement-slice headlessly in a dedicated worktree, one fresh harness session per slice, reading progress only from git trailers and the slices file.
A denied tool call or an iteration without a new slice trailer halts the run with the worktree kept for fixing, and clean completion removes the worktree and exits 0.
