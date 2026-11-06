---
"dan86de-skills": minor
---

Add `prove-change`, which checks a branch against its spec from a context that did not write it.
A spec prover walks every Behaviour entry in its own worktree at the branch `HEAD`, and keeps a `missing` or `looks wrong` finding only with a test or driver it wrote that fails there.
