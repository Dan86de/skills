---
"dan86de-skills": patch
---

`run-feature` pushes the slices branch itself after every session, from a bare clone only the host writes, with hooks off and a 1-hour GitHub App token from `github-app-token` on `PATH`, so nothing a session writes in its tree runs during the fetch or the push.
It no longer fetches origin into the worktree between sessions.
