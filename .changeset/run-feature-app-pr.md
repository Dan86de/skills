---
"dan86de-skills": patch
---

`run-feature` owns the slices branch's PR: no session runs `gh` or `git push`.
Each session reads the PR from `.run-feature/pr.json` and writes the changes it wants there, and the runner opens the PR as a draft, writes its body and `attention:` labels and marks it ready with the GitHub App's token.
`implement-slice` and `pr-brief` use that file when the system prompt names it, and `run-feature/scripts/github-app-token.mjs` mints the App's 1-hour token for one repository.
