# Decision record: run-feature

**Pain**: Between the interview and the PR review, Daniel is the cron job.
He opens tens of fresh sessions per feature just to type `/implement-slice` (64 times in agents-hq alone), learns about halts and finishes only by looking, and each unpredictable wait forces either babysitting or a context switch that loses the thread.

**Wedge**: A script that loops `/implement-slice` in a worktree until done or stuck, then signals once.
Worth shipping even with no auto-trigger, no config file, no digest, and a manual kick.

**Premise**: implement-slice runs unattended reliably enough that a loop multiplies its value instead of multiplying failures.
Survived: zero mid-run interventions across all 64 recorded sessions.

## Settled

- **Permission posture**: `--permission-mode acceptEdits` plus a per-project Bash allowlist, grown over time (seedable with the fewer-permission-prompts skill); a denied call halts the run and notifies.
  Rejected: `--dangerously-skip-permissions` in a worktree, because it hands unattended full shell to the main machine and is the one choice hard to walk back after an incident.
  Rejected: container/VM sandbox, because it is setup cost the wedge does not need while the allowlist converges.
- **Trigger**: one manual command, `run-feature <slug>`, typed when the interview ends.
  Rejected: auto-trigger on `decisions.md` landing and daemon-side scheduling, because they remove the one kick that expresses intent and belong to agents-hq later.
- **Resume after halt**: explicit re-kick after a human touched the branch.
  Rejected: auto-resume by polling, because it invites "it resumed while I was mid-edit" failures for a saving of one keystroke.
- **Notification**: local-only `notify()` calling `osascript` for a macOS banner plus sound; the banner carries only the end state, the terminal output and the PR hold the detail.
  Rejected: no notification, because a 30-90 minute run with no signal reinstates the polling the runner exists to delete.
  Rejected: ntfy.sh for now, because the real workflow is other work on the same machine; `notify()` stays one function so ntfy later is a three-line change.
- **Implementation**: a user-invoked `run-feature` skill in `skills/in-progress/`, its loop a single-file Node script (repo pins Node 24) with no dependencies.
  Rejected: bash, because git-trailer and slices-JSON parsing in bash is where v0s rot.
- **Pre-steps**: when `spec.md` or `slices.json` is missing, the runner calls `/write-spec` and `/write-slices` headlessly first; a missing verify skill halts with "run /make-verify".
  Rejected: refusing and telling the user, because both skills take no new decisions and refusing keeps two manual session-opens alive.
- **Ceilings**: max 12 iterations per kick, and the same slice id failing twice in a row halts immediately, so the pathological worst case is about two wasted attempts.
- **Worktree lifecycle**: auto-remove on clean completion (branch and PR survive), keep on halt so the human can cd in and fix.
  Rejected: always keep (dead weight) and always remove (destroys the intervention site).
- **Harness**: v0 shells out to `claude` only, isolated behind one function so a second harness is additive.
  Rejected: abstracting two harnesses before running one.
- **State source**: git trailers and the slices file are the only truth the loop reads; `claude -p` stdout is never parsed for state.

## Found during recon

- implement-slice already picks the lowest ready slice, gates, reviews, commits, pushes, and at branch end runs review-change, pr-brief and marks the PR ready (skills/in-progress/implement-slice/SKILL.md steps 4-9).
- All pipeline state lives in git: `Slice:` and `Slice-Pending:` trailers, review blocks in commit messages, `attention: read|spot-check|skim` labels from pr-brief.
- Session transcripts show the manual loop: 64 `/implement-slice` after `/clear` in agents-hq, 8 `/write-spec`, 8 `/write-slices`, 4 `/interview`, 2 `/make-verify`.
- agents-hq daemon already has `sessionStart`, `sessionEvents` with blocked-state badges via OSC 7501, and `worktreeCreate`; it is the designated future execution backend, not part of this wedge.
- Headless `claude -p` does not prompt; a non-allowed tool call is denied, which can make a run wander or die, hence halt-on-denial.

## Not doing

- Auto-trigger on `decisions.md` landing.
- agents-hq daemon as execution backend (future Phase 4).
- Any UI or dashboard.
- Per-project config file; v0 takes flags with hardcoded defaults.
- ntfy or any phone-reaching notification.
- Codex/OpenCode execution.
- OpenAI or second-model reviewers inside review-change.
- New verify tooling.
- Auto-merge of any PR; gated on its own future decision record, since it is the only piece that would ship unreviewed code to main.
- Parallel slices or parallel features.
- A babysit-prs digest loop; separate tool, separate day.

## Accepted breakage

- A denied Bash call halts the run even when harmless; early runs per project halt more than feels fair until the allowlist converges.
- stdout is not parsed, so an implement-slice run that exits without committing yields only a generic "no progress" halt.
- A macOS banner is missable away from the machine; halts can be found late until ntfy exists.
- A mediocre spec from headless write-spec/write-slices is discovered only at slice time.

## Done means

- Automated: on a test feature, one command takes a `decisions.md` with no spec through spec, slices, all slices committed on `slices/<slug>`, PR marked ready with an `attention:` label, worktree removed, exit 0.
- Automated: a forced halt (for example a hitl slice) leaves the worktree in place, exits non-zero, and fires a banner.
- Manual: one real feature in agents-hq or edm runs end to end where the only human touches are the kick and the PR review.

## Reversibility

Cost to undo is near zero: delete the skill and you are back to typing `/implement-slice`, with all state in git regardless.
The retreat signal is a run that wanders instead of halting, committing garbage slices that pass the gate; that would mean the allowlist posture is insufficient containment and the sandbox option gets revisited.
