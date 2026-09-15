# dan86de-skills

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
