# dan86de-skills

## 0.16.6

### Patch Changes

- [#54](https://github.com/Dan86de/skills/pull/54) [`2eb25bd`](https://github.com/Dan86de/skills/commit/2eb25bdadaf2cb1ecc2f34fffae5841ad189f3de) Thanks [@Dan86de](https://github.com/Dan86de)! - `run-feature` no longer leaves a slice's session open when its kick dies: a kick stopped by SIGTERM, SIGINT or SIGHUP ends the session it was running and settles it `stopped`, and the next kick of the feature ends and settles any session a kick killed outright left behind before it starts its own.

## 0.16.5

### Patch Changes

- [#52](https://github.com/Dan86de/skills/pull/52) [`3f9e88c`](https://github.com/Dan86de/skills/commit/3f9e88cbff40de0bcf3987d764310d349992b369) Thanks [@Dan86de](https://github.com/Dan86de)! - `interview` now opens each round with the beliefs it holds so far and flags the shakiest one, decides cheap-to-undo calls itself, withholds its recommendation on the one or two questions where the user's view matters most, asks behaviour as concrete scenarios, lets the user describe the subject freely before round zero, and records the terms it coined in the decision record and `spec/glossary.md`.

## 0.16.4

### Patch Changes

- [#50](https://github.com/Dan86de/skills/pull/50) [`663ba44`](https://github.com/Dan86de/skills/commit/663ba4431b7e1334bbb88348703d112056386859) Thanks [@Dan86de](https://github.com/Dan86de)! - `run-feature` takes `--agent-account`, which starts no session at 95% of the week or at a usage limit, shows the run `waiting` with the reset time, and resumes by itself once it resets.

- [#50](https://github.com/Dan86de/skills/pull/50) [`9d7637b`](https://github.com/Dan86de/skills/commit/9d7637b448b129a4d1e6fdd965b1d68b2f9d1b6b) Thanks [@Dan86de](https://github.com/Dan86de)! - `run-feature` owns the slices branch's PR: no session runs `gh` or `git push`.
  Each session reads the PR from `.run-feature/pr.json` and writes the changes it wants there, and the runner opens the PR as a draft, writes its body and `attention:` labels and marks it ready with the GitHub App's token.
  `implement-slice` and `pr-brief` use that file when the system prompt names it, and `run-feature/scripts/github-app-token.mjs` mints the App's 1-hour token for one repository.

- [#50](https://github.com/Dan86de/skills/pull/50) [`d613243`](https://github.com/Dan86de/skills/commit/d61324390efbe8575e7fcf4184342a6fe92ff264) Thanks [@Dan86de](https://github.com/Dan86de)! - `run-feature` pushes the slices branch itself after every session, from a bare clone only the host writes, with hooks off and a 1-hour GitHub App token from `github-app-token` on `PATH`, so nothing a session writes in its tree runs during the fetch or the push.
  It no longer fetches origin into the worktree between sessions.

- [#50](https://github.com/Dan86de/skills/pull/50) [`35a82bb`](https://github.com/Dan86de/skills/commit/35a82bb31e2cfc25447fe4f2c94df4d35e08cf94) Thanks [@Dan86de](https://github.com/Dan86de)! - `run-feature` refuses to start sessions unless kicked with `--on-host`, since every session would run on the host with full access, beside the shell's credentials, and logs the flag when given.

## 0.16.3

### Patch Changes

- [#48](https://github.com/Dan86de/skills/pull/48) [`60bec9a`](https://github.com/Dan86de/skills/commit/60bec9aaab0bc6a5da451372026c879e74be9006) Thanks [@Dan86de](https://github.com/Dan86de)! - `implement-slice` and `run-feature` take ready `afk` slices before a ready `hitl` one, so a slice waiting on a person no longer blocks the unattended work.
  `run-feature` halts as `slice stopped` with no retry when a session leaves uncommitted changes for the user, instead of retrying into the dirty tree and reporting the slice failed twice.

## 0.16.2

### Patch Changes

- [#46](https://github.com/Dan86de/skills/pull/46) [`4169888`](https://github.com/Dan86de/skills/commit/4169888ed24004b9f71bf0ff666fc05cc596658f) Thanks [@Dan86de](https://github.com/Dan86de)! - `run-feature` names where its sessions show as agents-hq and the Runs page instead of "the board", which was removed: its log now says "running outside agents-hq" and "was ended in agents-hq".

## 0.16.1

### Patch Changes

- [#44](https://github.com/Dan86de/skills/pull/44) [`972a1c7`](https://github.com/Dan86de/skills/commit/972a1c79ca472540e7237454a29ba4f772215f36) Thanks [@Dan86de](https://github.com/Dan86de)! - `review-change` hands its reviewer the project's glossary, `spec/glossary.md`, so it judges a drifted term against the names it settles.

## 0.16.0

### Minor Changes

- [#42](https://github.com/Dan86de/skills/pull/42) [`fd7568c`](https://github.com/Dan86de/skills/commit/fd7568c1e4b6cc370e077a81137155ace67a808a) Thanks [@Dan86de](https://github.com/Dan86de)! - `implement-slice` commits a proven bug its branch close cannot fix within three different causes as a known failure, rather than stopping: the proof stays, a test gets only its runner's expected-failure mark naming the finding so CI stays green, and the `Address review` commit carries a `Known-Failure:` trailer.
  The PR stays a draft with the bug first under **Needs you**, `pr-brief` raises it to `read`, and `run-feature` ends the run `waiting` with a `known failure` halt.

- [#42](https://github.com/Dan86de/skills/pull/42) [`fd7568c`](https://github.com/Dan86de/skills/commit/fd7568c1e4b6cc370e077a81137155ace67a808a) Thanks [@Dan86de](https://github.com/Dan86de)! - `implement-slice` closes a branch with `prove-change` instead of checking the branch against the spec itself.
  The close fixes the code until every proof `prove-change` handed over passes, short of a known failure, never edits one, deletes one only with a recorded reason, and commits a `Proved:` block that settles every `possible bug:` question as fixed, standing or dropped.
  The PR's `## Branch review` lists every dropped finding with its reason in a fold of its own, so a reader can see whether the provers drop too much.

- [#42](https://github.com/Dan86de/skills/pull/42) [`fd7568c`](https://github.com/Dan86de/skills/commit/fd7568c1e4b6cc370e077a81137155ace67a808a) Thanks [@Dan86de](https://github.com/Dan86de)! - Add `prove-change`, which checks a branch against its spec from a context that did not write it.
  A spec prover walks every Behaviour entry in its own worktree at the branch `HEAD`, and keeps a `missing` or `looks wrong` finding only with a test or driver it wrote that fails there.
  It skips what the branch's commits already record under `Deviations:`, and reports scope nothing asks for with its diff lines and spec line, and no run.
  A bug prover runs beside it in a second worktree, settles every unmarked `possible bug:` question from the branch's reviews as proven or dropped, and attacks the diff for bugs no question named.
  The skill then reruns every proof twice at `HEAD`, drops any that passes or fails on setup or for another reason with a one-line reason, and copies the surviving tests and drivers into the caller's working tree.
  Every proof must also pass the project's typecheck and lint, with a prover sent back once when one fails, since a proof gets committed unedited, and the bug prover gets the recorded deviations so it does not report them as bugs.

## 0.15.1

### Patch Changes

- [#40](https://github.com/Dan86de/skills/pull/40) [`6aff169`](https://github.com/Dan86de/skills/commit/6aff169533442555c8269865a2b775d33fe7c8d8) Thanks [@Dan86de](https://github.com/Dan86de)! - `run-feature` installs a fresh worktree's dependencies before any session, so a project whose pre-commit hook needs `node_modules` no longer crashes the kick on the first spec commit.
  A hook or remote refusing a commit the script makes itself now halts readably, and any unforeseen error exits 1 with one line instead of a stack trace.

## 0.15.0

### Minor Changes

- [#34](https://github.com/Dan86de/skills/pull/34) [`7116f21`](https://github.com/Dan86de/skills/commit/7116f2109f5cd63d30a47585571dac14ea096da9) Thanks [@Dan86de](https://github.com/Dan86de)! - Bring `run-feature` back onto the agents-hq board.
  Each session runs through the local daemon when one can take it, named, stoppable and grouped into a run with its outcome and retries, and falls back to `claude -p` off the board otherwise.

- [#34](https://github.com/Dan86de/skills/pull/34) [`7116f21`](https://github.com/Dan86de/skills/commit/7116f2109f5cd63d30a47585571dac14ea096da9) Thanks [@Dan86de](https://github.com/Dan86de)! - Report a feature's progress from `run-feature` to the agents-hq run progress card.
  Each kick reopens the feature's run by key, sends the whole plan on every state change, links each slice session to its slice, and ends the run with an outcome that says whether it needs you, stopped or failed.
  It now needs a daemon on contract 5 to run on the board.

### Patch Changes

- [`91b5e5f`](https://github.com/Dan86de/skills/commit/91b5e5feefe3b5cd470d68ab399119bfc3578204) Thanks [@Dan86de](https://github.com/Dan86de)! - `run-feature` names the agents-hq session it was kicked from as the run's launcher, so the run's card shows where it started.

## 0.14.0

### Minor Changes

- [`47688f5`](https://github.com/Dan86de/skills/commit/47688f5f6b33956a1e8720c66c36b8d17d8bbf6c) Thanks [@Dan86de](https://github.com/Dan86de)! - Defer manual checks to the ready PR, so `run-feature` no longer stops for them.
  In `write-slices`, `hitl` now means only an action an agent cannot perform, and a slice with only `done.manual` items is `afk`, so existing slices files keep halting until regenerated.
  `implement-slice` commits such a slice as done, writes the checks with how to reach them and step-by-step instructions in a `Manual-Checks` commit at the close, and gains `--rework <id> "<what failed>"` for a rejected check.
  `pr-brief` renders them as an unfolded `## Before you merge` checklist, foundations first, keeps ticks across reruns, and treats an unticked check as `spot-check` rather than `read`.
  `run-feature` now halts as `close incomplete` when the close session left no checklist or the PR still in draft, instead of reporting success.

## 0.13.0

### Minor Changes

- [#31](https://github.com/Dan86de/skills/pull/31) [`365a0ae`](https://github.com/Dan86de/skills/commit/365a0ae671795334dccaebaec5b7bdeb30cd502a) Thanks [@Dan86de](https://github.com/Dan86de)! - Add the in-progress run-feature skill: a zero-dependency runner that loops implement-slice headlessly in a dedicated worktree, one fresh harness session per slice, reading progress only from git trailers and the slices file.
  Sessions run with `--dangerously-skip-permissions`, and a project without committed Claude settings gets a default Bash allowlist seeded and committed before any session.
  Every session's system prompt carries a headless note so a skill settles open choices with its own defaults instead of ending the turn with a question, and a slices branch already checked out elsewhere refuses the kick readably.
  An iteration without a new slice trailer halts the run with the worktree kept for fixing, and clean completion removes the worktree and exits 0.
  A failed iteration gets one retry before the halt, one kick runs at most 12 sessions, and a slice awaiting human sign-off with nothing else ready halts naming the waiting slice.
  Every end state fires exactly one macOS banner with sound naming that end state.
  After a human fix, re-running the same command resumes from the kept worktree's git state; nothing resumes on its own.
  A missing spec or slices file is written and committed headlessly before the loop, and a project without a verify skill halts naming make-verify before any session starts.

## 0.12.2

### Patch Changes

- [#29](https://github.com/Dan86de/skills/pull/29) [`308ade6`](https://github.com/Dan86de/skills/commit/308ade6476b9264b587fe03649c16cddaa3e888f) Thanks [@Dan86de](https://github.com/Dan86de)! - implement-slice renders each slice's PR section as Markdown that leads with what needs the reader, links every finding to its line, and folds the proof away; review findings carry their outcome so fixed ones no longer read as open.

## 0.12.1

### Patch Changes

- [#26](https://github.com/Dan86de/skills/pull/26) [`44646ee`](https://github.com/Dan86de/skills/commit/44646ee549b95bd6505123142e2a9d03dd586b90) Thanks [@Dan86de](https://github.com/Dan86de)! - Shorten every skill description: model-invoked skills keep what they do plus a few distinctive triggers, user-invoked skills get one human-facing line.

## 0.12.0

### Minor Changes

- [`878dbe9`](https://github.com/Dan86de/skills/commit/878dbe9df3d6878bf619f5db44a258f8b8797ee6) Thanks [@Dan86de](https://github.com/Dan86de)! - Planning moves from `.scratch/` to a committed `spec/` folder, one `spec/features/<slug>/` per feature holding `decisions.md`, `spec.md` and `slices.json`.
  interview now saves its decision record there, write-spec and write-slices write beside it, and implement-slice refuses a slices file that is not committed.
  Readers look in `spec/glossary.md` and `.agents/coding-standards.md` first and keep the old root files as fallbacks.
  `.agents/conventions.md` gains a project file contract listing every path, who writes it and who reads it.

### Patch Changes

- [#21](https://github.com/Dan86de/skills/pull/21) [`0600a10`](https://github.com/Dan86de/skills/commit/0600a104ac940b747173aaed198e85e85031bca8) Thanks [@Dan86de](https://github.com/Dan86de)! - The project file contract lists `AGENTS.md`, `CLAUDE.md` and the `.scratch/` line in `.gitignore`, so faber init may write them.

## 0.11.0

### Minor Changes

- [#18](https://github.com/Dan86de/skills/pull/18) [`5810e07`](https://github.com/Dan86de/skills/commit/5810e0784d84663ac4a0f69d59c663b01192830d) Thanks [@Dan86de](https://github.com/Dan86de)! - Every in-progress skill is roughly half its old length, with the same behaviour and the same files, trailers, labels and report shapes other skills read.
  `review-change` now checks fit: a parallel model, a drifted term, or a half migration is reported against the existing pattern it competes with.
  `implement-slice` logs spec deviations in a `Deviations:` section of each slice commit, and `pr-brief` raises them as questions for the reviewer.
  New in-progress skill `recohere` finds where a codebase does one job more than one way, ranks each by how much it slows change, and finishes the migration you pick, guard included.

## 0.10.0

### Minor Changes

- [`a9586e2`](https://github.com/Dan86de/skills/commit/a9586e227efc6ec3353f005866a7f49af581c803) Thanks [@Dan86de](https://github.com/Dan86de)! - New in-progress skill `explore` maps a topic as an interactive mind map that surfaces unknown unknowns, grown branch by branch on request.
  It ships `scripts/map.mjs`, a zero-dependency Node script that checks a map file and renders it to one self-contained HTML page.
  `interview` now draws its design tree with that renderer once the tree grows or when asked, with states for settled, in-round, waiting, cut and not-doing decisions.
  The conventions gain a section on bundling scripts in a skill.

### Patch Changes

- [#16](https://github.com/Dan86de/skills/pull/16) [`e4dfa4c`](https://github.com/Dan86de/skills/commit/e4dfa4c8760bf74f48a5fa2faee99f7561aedc2f) Thanks [@Dan86de](https://github.com/Dan86de)! - `make-verify` now reports the branch its files landed on and that they must reach the default branch before `implement-slice` runs.
  `implement-slice` stops with a clear message when the verify skill is missing from the slice branch, instead of building without it.

## 0.9.0

### Minor Changes

- [#14](https://github.com/Dan86de/skills/pull/14) [`65a44f8`](https://github.com/Dan86de/skills/commit/65a44f8e379b24a4088fd4281843a0369a0ae83d) Thanks [@Dan86de](https://github.com/Dan86de)! - Rename the in-progress `pr` skill to `pr-brief` and `retro` to `codify`.
  `implement-slice` now calls `pr-brief`, and `codify` finds its last run by a commit subject starting with `Codify` instead of `Retro`.
  If you installed either skill with `npx skills@latest add`, remove the old one and add the new name.

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
