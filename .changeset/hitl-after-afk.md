---
"dan86de-skills": patch
---

`implement-slice` and `run-feature` take ready `afk` slices before a ready `hitl` one, so a slice waiting on a person no longer blocks the unattended work.
`run-feature` halts as `slice stopped` with no retry when a session leaves uncommitted changes for the user, instead of retrying into the dirty tree and reporting the slice failed twice.
