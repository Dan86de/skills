---
"dan86de-skills": minor
---

Add the user-invoked `retro` skill to `in-progress/`.
It asks which review comments you keep making, reads the merged PRs since the last retro for human comments, `Open:` review findings and `Address review` commits, and keeps only rules that you stated or that recur across two or more PRs.
It proposes each as an existing checker rule, a `## One-way doors` entry or a coding standard in `.agents/coding-standards.md`, plus moves of coding rules out of `AGENTS.md` and `CLAUDE.md`, and writes only what you approve, without committing.
