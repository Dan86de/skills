---
"dan86de-skills": minor
---

Add the `make-verify` skill to `in-progress/`.
Typed by the user in a project, it reads the repository and writes `.agents/skills/verify/`, a model-invoked skill that starts the product, drives it the way a user does, and records whether each check passed in `evidence.md`.
It also seeds a feature map under `docs/manual/`, adds the not-done-without-evidence rule to the project's agent instructions, and proves the new skill with one real run before handing it over.
