# Rework

`--rework S3 "<what failed>"` fixes a done slice after a person rejected one of its manual checks at the PR.
It adds to the branch, so S3 stays done and the slices built on it stay in place.

Refuse when S3 is not done.
With no description of what failed, ask for it.

1. **Build the fix** per step 5, from S3's commits and what failed, touching only what the rejection needs.
2. **Pass the gate** per step 6, claiming the `done.automated` items of S3 and of every slice that transitively depends on it through `blocked_by`.
   When a dependent slice's item fails, stop: commit nothing, leave the diff, and name the slices affected.
   That rejection reaches past S3, and rewriting later slices is the user's decision.
3. **Review it** per step 7.
4. **Commit and push** one commit, subject `Rework S3: <what failed>`, body shaped like step 8's with its proof, deviations and review block, and no `Slice:` trailer.
5. **Write the checklist again** per [manual-checks.md](manual-checks.md), against the new `HEAD`.
   Add the trailer `Retest: <ids>` beside `Manual-Checks:`, listing S3 and every slice that transitively depends on it, so those ticks reset.
6. **Refresh the PR**: add the rework line to S3's section per [pr-section.md](pr-section.md), then call the Skill tool with "pr-brief".
   A PR that is already ready stays ready.
