---
name: make-verify
description: Generate this project's verify skill, which starts the product, drives it the way a user does, and records whether each check passed.
disable-model-invocation: true
---

# make-verify

Write `.agents/skills/verify/`, a project skill an agent reads cold, mid-task, to prove a change works in the running product.
Every line names a real command, handle, or thing to look at.
If the project already has a verify skill, stop and say so.

## 1. Read the repository

From the code, asking the user only what it cannot say, find the **surfaces** (name the primary one), how to **start** it and know it is ready, how to **drive** it (existing harnesses first), what can **observe** a result, and whether two runs can be **isolated**.

If the product does not start, fix it or report why before writing anything.
For state that cannot be moved, ask the user about a config seam (the smallest setting, defaulting to today's value, in its own commit); what stays shared is out of reach unless the user says otherwise.

## 2. Write the skill

`.agents/skills/verify/SKILL.md` with `name: verify`.
Its description says it starts the product, drives it, and records whether each check passed, and that agents use it on their own before calling a change done: implement-slice finds it by those words.
Beside it, `agents/openai.yaml` with `allow_implicit_invocation: true`.

Body sections:

- **Start**: the command, the ready signal, and the run folder `.scratch/verify/<run>/` (`<run>` is a timestamp plus random characters), holding the run's own port and data, and none of the user's settings. Without isolation, refuse any instance the run did not start. List what a run cannot reach, and refuse it.
- **Doctor**: a read-only check that the instance is up, this run's, the current build, signed in. Run it first and whenever something looks off.
- **Drive**: real commands, with handles that survive a redesign: roles, accessible names, labels, routes, flags.
- **Proof bar**: drive the user's real path. Capture the action and the state it led to. Read side effects back. Drive every entry point the map lists. Fake only what production already puts behind a boundary.
- **Evidence**: `evidence.md` in the run folder holds:
  - the commit and branch, and whether the tree was dirty
  - the verdict: **Done**, **Done, with n not driven** naming them, **Not done** with the failed checks, or **Done once the map changes in this PR**
  - one section per check: verdict, note, what was captured, every command run with its output

  Each check is:
  - `pass`: the product does what the check says.
  - `fail`: it does not, and the code is wrong. The note says what happened instead.
  - `manual`: it does not, and the map is wrong, because the change meant this. The note says why, and the map changes in the same PR.
  - `not driven`: it needs something a run cannot reach. The note names it, and the check stays with the user.
- **Stop**: stop what this run started, by recorded pid, then confirm doctor says unfit. The run folder stays.

Ship a helper script only for what one command cannot do reliably, such as keeping a browser page alive.
It appends every call and its output to `transcript.log` in the run folder, reads state back through a logged command, refuses what the run must not reach, and records the real process pid.

## 3. Write the feature map

`docs/manual/`, also the user's own checklist, shaped like [references/feature-map-example/](references/feature-map-example/).
Write the top three to five features, copying each "you should see" from what the product showed while you drove it, and fold any existing manual in, keeping every step.
The skill points at the map and never copies it.

## 4. Wire it in

Edit existing files:

- Add to the project's agent instructions: a change the map describes is done only when a verify run's `evidence.md` has no failed check, and the map changes in the same PR as the behaviour.
- If `.claude/skills` is missing, commit it as a symlink to `../.agents/skills`.
- Ignore `.scratch/`.

## 5. Prove it

Have a fresh agent (or yourself, if none) follow only the skill and the map: start, doctor, drive one mapped feature, record it, stop.
Fix every line that made it guess, and repeat until one clean run leaves its `evidence.md` and nothing running.

## 6. Report

The surfaces and which one is driven, the isolation case, every file written, their branch and commit (they must reach the default branch before implement-slice runs), the proving run's folder and verdict, and what the skill cannot drive yet.
