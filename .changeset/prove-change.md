---
"dan86de-skills": minor
---

Add `prove-change`, which checks a branch against its spec from a context that did not write it.
A spec prover walks every Behaviour entry in its own worktree at the branch `HEAD`, and keeps a `missing` or `looks wrong` finding only with a test or driver it wrote that fails there.
It skips what the branch's commits already record under `Deviations:`, and reports scope nothing asks for with its diff lines and spec line, and no run.
A bug prover runs beside it in a second worktree, settles every unmarked `possible bug:` question from the branch's reviews as proven or dropped, and attacks the diff for bugs no question named.
The skill then reruns every proof twice at `HEAD`, drops any that passes or fails on setup or for another reason with a one-line reason, and copies the surviving tests and drivers into the caller's working tree.
Every proof must also pass the project's typecheck and lint, with a prover sent back once when one fails, since a proof gets committed unedited, and the bug prover gets the recorded deviations so it does not report them as bugs.
