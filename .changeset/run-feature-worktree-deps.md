---
"dan86de-skills": patch
---

`run-feature` installs a fresh worktree's dependencies before any session, so a project whose pre-commit hook needs `node_modules` no longer crashes the kick on the first spec commit.
A hook or remote refusing a commit the script makes itself now halts readably, and any unforeseen error exits 1 with one line instead of a stack trace.
