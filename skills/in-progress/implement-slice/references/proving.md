# Proving

How the branch close settles what prove-change reports.
prove-change keeps a finding only with a test or driver that fails at `HEAD`, hands those **proofs** to your working tree, and fixes nothing, so the context that fixes is never the one that judged.

## Settling each finding

- **Kept**, a spec `missing` or `looks wrong` line, a `proven` question, or an `Attack` line: fix the product code until its proof passes, as step 6 fixes a `fail`, up to three different causes per proof.
- **Not asked for**: remove the scope, or keep it with a reason.
- **Dropped**, by a prover or by prove-change's recheck: nothing to fix.
- **A question** the bug prover's block leaves neither `proven` nor `dropped`: reachable only when prove-change returned that block with a `Shape:` line, it stops the close like step 6, since unsettled questions are what this close exists to end.

prove-change reads only committed questions, so a `possible bug:` question from the close's own review never reaches it: fix it, or mark it ` => stands:` with why, never leave it unmarked.

A proof is read-only: never edit it or a file it imports that prove-change handed over, so the fix answers the proof rather than the other way round.
Delete one only when you can say in one line why it proves nothing, such as asserting what the spec rules out or what a recorded deviation already says the branch does instead; record that under `Deleted proofs:`, and its finding counts as dropped with that reason.
Commit every surviving proof with the fix, and gate each like a slice's checks: a test passes under the project's tests, and a driver runs to exit 0 against a verify run started after your last edit.

These stop the close like step 6:

- prove-change stops, or returns without its recheck
- a proof listed under `Not handed over`, since you would be fixing against a copy you cannot commit
- a proof still failing after three different causes

## The Proved block

The `Address review` commit carries it after the review block, one line per finding of the report, each on one physical line:

```text
Proved: prove-change at <short HEAD it ran on>, <n> kept, <n> not asked for, <n> dropped
- spec 3 missing - <what the finding states> - <proof path> => fixed: <what changed>
- Q2 <the question's line without its leading "- "> => fixed: <what changed>, proof <proof path>
- attack 1 - <what the finding states> - <proof path> => fixed: <what changed>
- spec 9 not asked for - <diff lines> - <spec line> => stands: <why it is kept>

Dropped:
- Q1 <the question's line without its leading "- "> => stands: not proven, <the report's reason>
- spec 5 - <the report's reason>

Deleted proofs:
- <proof path> - <why it proves nothing>
```

A question keeps its line word for word, so the outcome after it settles every copy of that line in the branch's log, and none is left without `=> fixed`, `=> stands`, or a place under `Dropped`.
`Dropped` and `Deleted proofs` read `- none` when empty.
Each proof also gets a line under the commit's checks: `- <spec 3, Q2 or attack 1> -> <proof path>: pass`.
