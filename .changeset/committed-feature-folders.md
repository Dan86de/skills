---
"dan86de-skills": minor
---

Planning moves from `.scratch/` to a committed `spec/` folder, one `spec/features/<slug>/` per feature holding `decisions.md`, `spec.md` and `slices.json`.
interview now saves its decision record there, write-spec and write-slices write beside it, and implement-slice refuses a slices file that is not committed.
Readers look in `spec/glossary.md` and `.agents/coding-standards.md` first and keep the old root files as fallbacks.
`.agents/conventions.md` gains a project file contract listing every path, who writes it and who reads it.
