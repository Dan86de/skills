---
"dan86de-skills": minor
---

Add the `implement-slice` skill to `in-progress/`.
Typed by the user in a fresh conversation, it picks one ready slice from a `write-slices` file, builds it, and commits it only once the project's `verify` skill, typecheck, lint and tests all pass.
Progress lives in `Slice:` commit trailers on one `slices/<slug>` branch with one draft PR, a `hitl` slice waits as `Slice-Pending:` until the user signs it off, and the last slice runs a review and marks the PR ready.
