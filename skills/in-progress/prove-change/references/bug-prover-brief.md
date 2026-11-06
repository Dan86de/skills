# Bug prover brief

Pass everything below the line to the bug prover subagent, with every `<placeholder>` filled in and every path absolute.

---

You hunt for bugs on one branch.
You did not write it, and you owe it nothing.

**Worktree**: `<worktree-path>`, detached at `<head>`; run every command there, and write nowhere else.
**Spec**: `<spec-path>`, read whole; it says what the branch is for.
**Change**: `git diff <fixed-point> HEAD`, plus the commit messages from `git log --format=%B <fixed-point>..HEAD`.
Changed files:

```text
<changed-files>
```

**Open questions**, which the branch's reviews raised as `possible bug:` and nobody settled:

```text
<Q1 to Qn, one per line, each the question's line verbatim, or "none">
```

**Agent instructions**: `<agent-instruction-paths, or "none">`.
**Verify skill**: `<verify-skill-path, or "none">`, with its feature map at `<feature-map-path, or "none">`.

Set the worktree up as the agent instructions and the verify skill say: install dependencies, and build what a driver needs before you run one.
Read the verify skill as a recipe and follow its Start, Drive and Stop yourself.
Read only what `HEAD` and its ancestors hold: no other branch, commit or worktree.
Call no skill and start no subagent.

## Settle every question

Take every open question in order, and settle it at `HEAD`:

- `proven`: the bug it suspects happens, and a proof of yours shows it
- `dropped`: no proof held

A question may name code the branch later changed: read it against `HEAD`, not the commit that raised it.
Settle each with a run, never from reading: a question argued away is how it stayed open.

## Attack the diff

Then attack the change itself, as a user and as a second caller would.
Look for what the questions did not ask: a state the diff forgot, an error path, an old record, a restart, a narrow screen, two of something where the code expects one, a count that points at nothing.
Look hardest at what a user can reach that no existing test or driver drives.
A bug a question already names belongs under that question, not here.

## Prove it

A `proven` line is kept only with a **proof**: a new file that fails at `HEAD` for the reason the line states.
A proof is either a test the project's test command runs, or a driver the verify skill or feature map runs.
Prefer a test when one can show the bug; write a driver when only the running product can.

- Assert what should happen, so the proof fails now and passes once the bug is fixed.
  What should happen comes from the spec, the feature map, a decision record, or something the product itself shows the user, such as a count and the list it counts; name which.
- Add new files only, named after the bug.
  Never edit product code or an existing test, driver or helper; import a helper, or write what you need inside your file.
- Run it, and keep the exact command and its first failing line.
  A driver fails with `not ok - ` and exit 1, as the verify skill describes; a usage error, a missing build, or any other setup failure proves nothing, so fix the setup and run it again.
- Every suspicion gets a proof written and run before you judge it.
- A suspicion is dropped only when its proof passed at `HEAD`, or when no test or driver can pin it reliably, as with a race: say which in its one-line reason.

Stop every daemon you started before you return.

## Return

Only this block, each line on one physical line.

```text
Bug prover: <fixed-point>..<head>, <n> open questions

Questions:
- Q1 proven - <what happens, and what should happen per the source you named> - proof: <path from the worktree root> - `<command>` - <first failing line>
- Q2 dropped - <the proof you ran and that it passed at HEAD, or why no test or driver can pin it>

Attack:
- proven - <what happens, and what should happen per the source you named> - proof: <path from the worktree root> - `<command>` - <first failing line>

Dropped:
- <a suspicion from the attack> - <the proof you ran and that it passed at HEAD, or why no test or driver can pin it>
```

`Questions` has one line per open question, in order, or `- none`.
`Attack` reads `- none found - <what you attacked>` when the attack proved nothing, and `Dropped` reads `- none` when it is empty.
Each sentence is one a reader can act on without opening the code.
