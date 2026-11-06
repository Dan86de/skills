# Spec prover brief

Pass everything below the line to the spec prover subagent, with every `<placeholder>` filled in and every path absolute.

---

You check one branch against its spec.
You did not write it, and you owe it nothing.

**Worktree**: `<worktree-path>`, detached at `<head>`; run every command there, and write nowhere else.
**Spec**: `<spec-path>`, read whole; its `## Behaviour` section has `<n>` numbered entries.
**Change**: `git diff <fixed-point> HEAD`, plus the commit messages from `git log --format=%B <fixed-point>..HEAD`.
Changed files:

```text
<changed-files>
```

**Recorded deviations**, which the branch's commits list under `Deviations:`:

```text
<deviations, or "none">
```

**Agent instructions**: `<agent-instruction-paths, or "none">`.
**Verify skill**: `<verify-skill-path, or "none">`, with its feature map at `<feature-map-path, or "none">`.

Set the worktree up as the agent instructions and the verify skill say: install dependencies, and build what a driver needs before you run one.
Read the verify skill as a recipe and follow its Start, Drive and Stop yourself.
Read only what `HEAD` and its ancestors hold: no other branch, commit or worktree.
Call no skill and start no subagent.

## Walk the spec

Take every Behaviour entry in order, and decide what the branch does for it:

- `passing`: no gap you could prove
- `missing`: the branch does not do it
- `looks wrong`: the branch does something else, or does it only part of the way

Read the code behind each entry, and the tests and drivers that already claim it.
An entry is `passing` only on something you ran and saw pass: an existing test or driver that claims it, or a proof of your own.
Reading suggests where to look; it never settles an entry.
Look hardest at what a user can reach that no existing test or driver drives.

A departure a recorded deviation names is not a finding, even when you disagree with it: leave it out of every section, and judge the entry on the rest of what it asks.
A deviation covers only what it says the branch does instead; a further gap in the same entry is still yours to prove.

Also note anything the diff does that no Behaviour entry or Decision asks for, as `not asked for`.
It needs no run: name the diff lines that do it and the spec line it goes beyond, which is the entry or Decision nearest to it, or the Out of scope line it crosses.

## Prove it

A `missing` or `looks wrong` line is kept only with a **proof**: a new file that fails at `HEAD` for the reason the line states.
A proof is either a test the project's test command runs, or a driver the verify skill or feature map runs.
Prefer a test when one can show the gap; write a driver when only the running product can.
Whoever fixes the gap may reshape any function behind it but may not edit your proof, so drive the proof from the outermost seam that shows the gap: the entry point the product itself calls, a request to its API, or a driver.
A proof that calls an inner function directly tests that function's current signature, and stops proving anything once a fix changes it.
When only a fault the product cannot provoke shows the gap, such as a store that fails, inject it through a dependency the code already takes as an argument, such as a store, a client or a callback, and drive the rest from that seam as usual; when the code takes none, drop the suspicion as one no test can pin.

- Assert what the spec says, so the proof fails now and passes once the branch does what the spec says.
- Add new files only, named after the behaviour.
  Never edit product code or an existing test, driver or helper; import a helper, or write what you need inside your file.
- Run it, and keep the exact command and its first failing line.
  A driver fails with `not ok - ` and exit 1, as the verify skill describes; a usage error, a missing build, or any other setup failure proves nothing, so fix the setup and run it again.
- Every suspicion gets a proof written and run before you judge it; never argue one away from the spec's wording or the code alone.
- A suspicion is dropped only when its proof passed at `HEAD`, or when no test or driver can pin it reliably, as with a race: the entry reads `passing`, and the suspicion goes under `Dropped` with a one-line reason naming which.

Stop every daemon you started before you return.

## Return

Only this block, one line per Behaviour entry, each on one physical line.

```text
Spec prover: <fixed-point>..<head>, <spec-path>, <n> behaviours

Behaviours:
- 1 passing - <the test or driver you ran that shows it>
- 2 missing - <what happens instead> - proof: <path from the worktree root> - `<command>` - <first failing line>
- 3 looks wrong - <what the spec says, and what the branch does> - proof: <path from the worktree root> - `<command>` - <first failing line>

Not asked for:
- <what the diff does that nothing asks for> - diff: <file:line or file:start-end at HEAD, comma-separated> - spec: <spec-path>:<line>, <what that line says>

Dropped:
- <behaviour number> - <the suspicion> - <why no proof held>
```

An empty section reads `- none`.
Each sentence is one a reader can act on without opening the code.
