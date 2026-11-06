---
"dan86de-skills": minor
---

`implement-slice` closes a branch with `prove-change` instead of checking the branch against the spec itself.
The close fixes the code until every proof `prove-change` handed over passes, short of a known failure, never edits one, deletes one only with a recorded reason, and commits a `Proved:` block that settles every `possible bug:` question as fixed, standing or dropped.
The PR's `## Branch review` lists every dropped finding with its reason in a fold of its own, so a reader can see whether the provers drop too much.
