---
"dan86de-skills": minor
---

Add the `review-change` skill to `in-progress/`.
It reviews a change against the repo's own coding standards, or a short language-neutral baseline of test lies and design smells, in one fresh-context subagent.
It applies single-file, behaviour-neutral fixes in the working tree, never commits, and reports the rest as a plain-text block with `blocks`, `judgement` and `question` findings.
`implement-slice` now runs it on every slice before the commit, carries its block in the commit body and the PR, and gives a `blocks` finding one fix round before the slice stops.
