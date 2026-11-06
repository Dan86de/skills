# Proving

How the branch close settles what prove-change reports.
prove-change keeps a finding only with a test or driver that fails at `HEAD`, hands those **proofs** to your working tree, and fixes nothing, so the context that fixes is never the one that judged.

## Settling each finding

- **Kept**, a spec `missing` or `looks wrong` line, a `proven` question, or an `Attack` line: fix the product code until its proof passes, as step 6 fixes a `fail`, up to three different causes per proof.
- **Not asked for**: remove the scope, or keep it with a reason.
- **Dropped**, by a prover or by prove-change's recheck: nothing to fix.
- **A question** the bug prover's block leaves neither `proven` nor `dropped`: reachable only when prove-change returned that block with a `Shape:` line, it stops the close like step 6, since unsettled questions are what this close exists to end.

prove-change reads only committed questions, so a `possible bug:` question from the close's own review never reaches it: fix it, or mark it ` => stands:` with why, never leave it unmarked.

A proof is read-only: never edit it or a file it imports that prove-change handed over, so the fix answers the proof rather than the other way round; the one exception is a known failure's mark.
Delete one only when you can say in one line why it proves nothing, such as asserting what the spec rules out or what a recorded deviation already says the branch does instead; record that under `Deleted proofs:`, and list its finding under `Dropped` with `deleted proof` as its reason.
Commit every surviving proof with the fix, and gate each but a known failure like a slice's checks: a test passes under the project's tests, and a driver runs to exit 0 against a verify run started after your last edit.

These stop the close like step 6:

- prove-change stops, or returns without its recheck
- a proof listed under `Not handed over`, since you would be fixing against a copy you cannot commit

## A known failure

A proof still failing after three different causes is a proven bug the close could not fix: commit it as a **known failure** rather than stopping or deleting it, so the bug stays tracked and CI stays green.
Revert the failed causes, and keep the proof as handed over except for one edit to a test: the test runner's expected-failure mark naming the finding, such as `{ todo: "known failure: prove-change Q2 - <what the finding states>" }` on a `node:test` test.
A driver needs no mark, as CI never runs one.
Its finding's line in the `Proved:` block ends ` => stands: known failure, proof <proof path>, tried <each cause, separated by "; ">`, and the commit gets one `Known-Failure: <spec 3, Q2 or attack 1>` trailer for it.
The close then leaves the PR a draft for a person.
A later close finds each known failure by the `Known-Failure:` trailers and `stands: known failure` lines of earlier `Address review` commits, which give its proof path, and takes it as a kept finding again: when its proof passes, remove the mark, and the new `Address review` carries no `Known-Failure` trailer for it.

## The Proved block

The `Address review` commit carries it after the review block, one line per finding of the report, each on one physical line:

```text
Proved: prove-change at <short HEAD it ran on>, <n> kept, <n> not asked for, <n> dropped
- spec 3 missing - <what the finding states> - <proof path> => fixed: <what changed>
- Q2 <the question's line without its leading "- "> => fixed: <what changed>, proof <proof path>
- attack 1 - <what the finding states> - <proof path> => fixed: <what changed>
- spec 9 not asked for - <diff lines> - <spec line> => stands: <why it is kept>
- Q4 <the question's line without its leading "- "> => stands: known failure, proof <proof path>, tried <cause 1>; <cause 2>; <cause 3>

Dropped:
- Q1 <the question's line without its leading "- "> => stands: not proven, <the report's reason>
- spec 5 - <what the finding or suspicion states> - <the report's reason>
- attack 1 - <what the finding states> - deleted proof
- attack - <a suspicion the bug prover dropped> - <the report's reason>

Deleted proofs:
- <proof path> - <why it proves nothing>
```

A question keeps its line word for word, so the outcome after it settles every copy of that line in the branch's log, and none is left without `=> fixed`, `=> stands`, or a place under `Dropped`.
Apart from `deleted proof`, every reason under `Dropped` is the report's word for word, so the PR shows what the provers said.
`Dropped` and `Deleted proofs` read `- none` when empty.
Each proof also gets a line under the commit's checks: `- <spec 3, Q2 or attack 1> -> <proof path>: pass`, or `known failure` in place of `pass`.
