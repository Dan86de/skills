---
"dan86de-skills": patch
---

`make-verify` now reports the branch its files landed on and that they must reach the default branch before `implement-slice` runs.
`implement-slice` stops with a clear message when the verify skill is missing from the slice branch, instead of building without it.
