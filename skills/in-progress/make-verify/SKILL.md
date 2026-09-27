---
name: make-verify
description: Generate this project's verify skill, which starts the product, drives it the way a user does, and records whether each check passed.
disable-model-invocation: true
---

# make-verify

Write `.agents/skills/verify/`, a project skill that lets any agent prove a change works in the running product instead of asking the user to check.
The next agent reads it cold, mid-task, having never seen the product, so every line names a real command, a real handle, or a real thing to look at.

If the project already has a verify skill, stop and say so.
Improving an existing one is a different job from writing one.

## 1. Read the repository

Answer these from the code, with the file for each, and ask the user only what the code cannot say:

- **Surfaces:** what a user touches: pages, a CLI, an API, a desktop app, a device. Name the primary one and list the rest.
- **Start:** the project's own documented way to run it locally, the environment it reads, where it keeps state, and how you know it is ready.
- **Drive:** how an agent can act on it. Existing harnesses first (end-to-end specs, a debug port, a scriptable client), then a generic route: a browser driven through the accessibility tree, a terminal session, plain HTTP.
- **Observe:** what can prove a result: a screenshot and accessibility tree, a command's output and exit code, a response body, rows in a database, files written, a log line.
- **Isolate:** whether two runs can go side by side, each with its own port, data and profile, without touching anything the user has open.

If the product does not start as it is, fix that or report exactly why before writing anything.
A skill written against a broken start teaches wrong steps.

When a piece of state cannot be pointed elsewhere (a hardcoded path, a fixed port), ask the user whether to add a config seam for it.
A seam is the smallest setting that moves it, with today's value as the default, in its own commit, and it never changes behaviour.
Anything that stays shared, such as a desktop app with one instance on the machine, is out of the run's reach: ask the user whether runs may touch it at all, and default to never.

## 2. Write the skill

`.agents/skills/verify/SKILL.md`, with `name: verify` and a description that says it starts the product, drives it, and records whether each check passed, and that agents should use it on their own before calling a change done.
The description is how every harness finds it and how write-spec and write-slices recognise it, so keep both halves.
Beside it, `agents/openai.yaml` with `allow_implicit_invocation: true`: this skill is model-invoked.

The body has these sections, every one filled from what step 1 found:

- **Start:** the exact command, the ready signal, and where the run's files go: `.scratch/verify/<run>/`, with `<run>` a timestamp plus a few random characters.
  Give each run its own port and data inside that folder, and keep the user's own settings out of its environment.
  When the product cannot be isolated, say so here, and have the skill refuse to drive an instance the run did not start.
  Name what a run cannot reach, and list the commands it therefore refuses.
- **Doctor:** one read-only check that says whether the instance is worth driving: the process is up, it is this run's, it is the current build, it is signed in.
  Run it first, and again whenever something looks off.
- **Drive:** the steps with this product's real commands and handles.
  Prefer handles that survive a redesign: roles and accessible names, labels, routes, prompt strings, flags.
- **Evidence:** what each check captures, and the shape of `evidence.md` in the run folder (below).
- **Stop:** stop what this run started and nothing else, never by process name.
  The run folder and its evidence stay.

Ship a helper script only for a step one command cannot do reliably, such as starting the product with a run's own environment or keeping a browser page alive between commands.
A helper is executable, lives in the skill folder, and its exact invocation is in the skill body.
When there is one, it also:

- appends every call to `transcript.log` in the run folder, quoted so it can be run again, with what it printed, failures and refusals included, so evidence is copied rather than paraphrased
- gives a logged way to read what a step left behind (files, rows, state), so a side effect is evidence rather than a claim
- refuses what the run must not reach, saying so and changing nothing
- records the pid of the process itself, not of a shell around it; check that stop really stopped it and that doctor then says unfit

### evidence.md

The same shape in every project, so the user reads every project's evidence the same way:

- the commit and branch it ran against, and whether there were uncommitted changes
- the verdict: **Done**, **Done, with n not driven** naming them, **Not done** with the failed checks, or **Done once the map changes in this PR**
- one section per check, with its verdict, a note, what was captured, and every command run for it with its output

A check is one of:

- `pass`: the product does what the check says.
- `fail`: it does not, and the code is wrong. The note says what happened instead.
- `manual`: it does not, and the map is wrong, because the change meant this. The note says why, and the map changes in the same PR.
- `not driven`: it needs something a run cannot reach. The note names it, and that check stays with the user.

Write the proof bar into the skill as it stands:

- Drive the user's real path, never an internal setter or a test-only endpoint.
- Capture the action and the state it led to, not only the final screen.
- Check side effects as well as what is visible: rows written, files created, messages sent.
- Cover every entry point the map lists for the feature. One not driven is reported as not driven, never as verified through another.
- Use a fake only where production already puts a boundary around the external system the check is not about.

## 3. Write the feature map

The map lives in the project, at `docs/manual/`, because it is also the user's own checklist of what the product does:

- `README.md`: how to start from a known state, the driving conventions, and an index of the feature files
- one file per feature, following [references/feature-map-example/](references/feature-map-example/)

Write the top three to five features to start, taken from routes, commands, menus and docs.
Write each "you should see" from what the product actually printed or showed while you drove it, not from reading the code.
If the project already has a manual, split it into this shape, keeping every step, rather than writing a second one.
The skill points at the map and never copies it.

## 4. Wire it in

- Add a rule to the project's agent instructions: a change the map describes is not done until a verify run produced an `evidence.md` with no failed check, and the map changes in the same PR as the behaviour.
- If `.claude/skills` does not exist, commit it as a symlink to `../.agents/skills`, so Claude Code finds the skill too.
- Make sure `.scratch/` is ignored.

Edit existing files; never replace them.

## 5. Prove it

Follow the new skill's own words, and nothing else, once: start, doctor, drive one mapped feature, record its check, stop.
Then confirm `evidence.md` is still in the run folder and nothing the run started is still running.
You wrote the skill, so you will fill its gaps without noticing: if you can hand the run to a fresh agent that reads only the skill and the map, do, and ask it to report every line that was unclear, wrong or made it guess.
Fix whatever the run found, stop what a failed attempt started, and go again until one clean run passes.
A skill that was never run is a draft.

## 6. Report

- the surfaces, and which one the skill drives
- the isolation case, and why
- every file written or edited
- the run folder of the proving run, and its verdict
- what the skill cannot drive yet
