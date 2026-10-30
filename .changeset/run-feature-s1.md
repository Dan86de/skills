---
"dan86de-skills": minor
---

Add the in-progress run-feature skill: a zero-dependency runner that loops implement-slice headlessly in a dedicated worktree, one fresh harness session per slice, reading progress only from git trailers and the slices file.
A denied tool call or an iteration without a new slice trailer halts the run with the worktree kept for fixing, and clean completion removes the worktree and exits 0.
A failed iteration gets one retry before the halt, one kick runs at most 12 sessions, and a slice awaiting human sign-off with nothing else ready halts naming the waiting slice.
Every end state fires exactly one macOS banner with sound naming that end state.
After a human fix, re-running the same command resumes from the kept worktree's git state; nothing resumes on its own.
