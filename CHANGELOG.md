# dan86de-skills

## 0.8.0

### Minor Changes

- [#12](https://github.com/Dan86de/skills/pull/12) [`7e19c09`](https://github.com/Dan86de/skills/commit/7e19c0934970ad2aed1947dc5b3ce776cdae3dda) Thanks [@Dan86de](https://github.com/Dan86de)! - Add the user-invoked `retro` skill to `in-progress/`.
  It asks which review comments you keep making, reads the merged PRs since the last retro for human comments, `Open:` review findings and `Address review` commits, and keeps only rules that you stated or that recur across two or more PRs.
  It proposes each as an existing checker rule, a `## One-way doors` entry or a coding standard in `.agents/coding-standards.md`, plus moves of coding rules out of `AGENTS.md` and `CLAUDE.md`, and writes only what you approve, without committing.

## 0.7.0

### Minor Changes

- [#10](https://github.com/Dan86de/skills/pull/10) [`32c5eb3`](https://github.com/Dan86de/skills/commit/32c5eb32bdc626dfd8085699a88b55dbf785b23a) Thanks [@Dan86de](https://github.com/Dan86de)! - Add the `pr` skill to `in-progress/`.
  It writes a branch's PR body as an attention call, a visual summary, harvested evidence and a Merge Danger section, with the one-way or two-way door judged by a fresh-context subagent against a built-in baseline plus a repo's own `## One-way doors` rules.
  It updates the branch's existing PR body and sets one `attention: read`, `attention: spot-check` or `attention: skim` label, keeps everything it does not own in a collapsed build log, and never pushes, opens, merges or marks a PR ready.
  `implement-slice` now calls it when it closes a branch, before marking the PR ready.

## 0.6.0

### Minor Changes

- [#8](https://github.com/Dan86de/skills/pull/8) [`06b5676`](https://github.com/Dan86de/skills/commit/06b5676d5c9adb108153fba04c939c2c834394f3) Thanks [@Dan86de](https://github.com/Dan86de)! - Add the `review-change` skill to `in-progress/`.
  It reviews a change against the repo's own coding standards, or a short language-neutral baseline of test lies and design smells, in one fresh-context subagent.
  It applies single-file, behaviour-neutral fixes in the working tree, never commits, and reports the rest as a plain-text block with `blocks`, `judgement` and `question` findings.
  `implement-slice` now runs it on every slice before the commit, carries its block in the commit body and the PR, and gives a `blocks` finding one fix round before the slice stops.

## 0.5.0

### Minor Changes

- [#6](https://github.com/Dan86de/skills/pull/6) [`1118701`](https://github.com/Dan86de/skills/commit/11187010e5d1ac993851deeee6b323b5db5c5c0a) Thanks [@Dan86de](https://github.com/Dan86de)! - Add the `implement-slice` skill to `in-progress/`.
  Typed by the user in a fresh conversation, it picks one ready slice from a `write-slices` file, builds it, and commits it only once the project's `verify` skill, typecheck, lint and tests all pass.
  Progress lives in `Slice:` commit trailers on one `slices/<slug>` branch with one draft PR, a `hitl` slice waits as `Slice-Pending:` until the user signs it off, and the last slice runs a review and marks the PR ready.

## 0.4.0

### Minor Changes

- [#4](https://github.com/Dan86de/skills/pull/4) [`346938c`](https://github.com/Dan86de/skills/commit/346938cbd59a398592cb723f925b3789d739eb5e) Thanks [@Dan86de](https://github.com/Dan86de)! - Add the `make-verify` skill to `in-progress/`.
  Typed by the user in a project, it reads the repository and writes `.agents/skills/verify/`, a model-invoked skill that starts the product, drives it the way a user does, and records whether each check passed in `evidence.md`.
  It also seeds a feature map under `docs/manual/`, adds the not-done-without-evidence rule to the project's agent instructions, and proves the new skill with one real run before handing it over.

## 0.3.0

### Minor Changes

- [`dc7539e`](https://github.com/Dan86de/skills/commit/dc7539e154ec00f74ef53e5a609252c02a5b7896) Thanks [@Dan86de](https://github.com/Dan86de)! - `write-spec` and `write-slices` recognise a project's verification skill.
  Where a project has one, `write-spec` lists the checks it can run under Automated as verify steps, and `write-slices` puts them in `done.automated`, so a slice is `hitl` only for human judgement or an action an agent cannot perform.

## 0.2.0

### Minor Changes

- [`f1d31c1`](https://github.com/Dan86de/skills/commit/f1d31c1f48eec3fae2b9ae4176824ed7c1cd1682) Thanks [@Dan86de](https://github.com/Dan86de)! - Add the `write-slices` skill to `in-progress/`.
  Reads a spec written by `write-spec`, checks that its seams still exist, shows an outline of vertical slices for correction, then writes one JSON file to `.scratch/slices` with behaviour numbers, seams, blocking edges, and per-slice autonomy, and self-checks it against a fixed rule list.

## 0.1.0

### Minor Changes

- [`bdbf372`](https://github.com/Dan86de/skills/commit/bdbf37267183d0d7875a2fb9f4ee33338ee14c34) Thanks [@Dan86de](https://github.com/Dan86de)! - Add the `write-spec` skill to `in-progress/`.
  Synthesises an already-settled plan into a ten-section spec, grounds it in the codebase with a locate/analyze/prior-art pass that describes rather than designs, settles the test seams, and writes one file to `.scratch/specs`.

- [`bdbf372`](https://github.com/Dan86de/skills/commit/bdbf37267183d0d7875a2fb9f4ee33338ee14c34) Thanks [@Dan86de](https://github.com/Dan86de)! - Add the `interview` skill to `in-progress/`.
  A round-based plan interrogation that opens with a kill condition, works the decision frontier in rounds, sweeps for the dimensions nobody volunteers, and ends in a decision record.
