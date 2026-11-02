---
"dan86de-skills": minor
---

Defer manual checks to the ready PR, so `run-feature` no longer stops for them.
In `write-slices`, `hitl` now means only an action an agent cannot perform, and a slice with only `done.manual` items is `afk`, so existing slices files keep halting until regenerated.
`implement-slice` commits such a slice as done, writes the checks with how to reach them and step-by-step instructions in a `Manual-Checks` commit at the close, and gains `--rework <id> "<what failed>"` for a rejected check.
`pr-brief` renders them as an unfolded `## Before you merge` checklist, foundations first, keeps ticks across reruns, and treats an unticked check as `spot-check` rather than `read`.
`run-feature` now halts as `close incomplete` when the close session left no checklist or the PR still in draft, instead of reporting success.
