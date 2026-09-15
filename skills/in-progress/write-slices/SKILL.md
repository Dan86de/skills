---
name: write-slices
description: Decompose a spec written by write-spec into vertical slices with blocking edges, one JSON file written to .scratch/slices.
disable-model-invocation: true
---

# Write Slices

Turn a spec into the plan an implementing agent would otherwise keep in its head.

You are not deciding scope here.
The spec already says what is true once the work is done and where it gets tested.
Your job is to cut that into pieces small enough to review honestly, say which piece blocks which, and say which pieces an agent can sign off alone.

The output is one JSON file.
Nothing in this skill writes code, and nothing in it changes the spec.

## Step 1: Take the spec

Take the spec path from the invocation.
If none was given and `.scratch/specs/` holds exactly one file, propose that one and confirm.
Otherwise ask for the path.

Read the spec in full.

It must have a **Behaviour** section and a **Seams** section.
If either is missing, stop.
Name the missing section, tell the user to run `/write-spec` first, and end the turn.
Do not derive the section yourself.
Deriving behaviours is deciding scope, and scope belongs to the skills that ran before this one.

Behaviour is a numbered list.
Those numbers are the only way a slice will ever refer to a behaviour, so note them exactly as written.

## Step 2: Check the seams and stamp the commit

The spec was written against a codebase that may have moved.
This is the one place this skill reads the code, and it reads only to confirm what the spec cites.

For every `file:line` in the Seams section, check that the file exists in the working tree.
A seam the spec marks as new has no `file:line` yet.
Skip it here and refer to it later by the exact phrase the spec uses.

If any cited file is missing, report every missing seam, one per line, and stop.
Do not guess where the seam went.
Tell the user to fix the spec, by hand or by running `/write-spec` again, and end the turn.

The check is existence only.
A seam whose file still exists but whose meaning has moved will pass, and that is accepted.
A full grounding pass already ran in `write-spec`, and a second one invites design creep.

Record the commit SHA and the branch of the working tree.
They go into the file so a reader can tell how stale the decomposition is.

## Step 3: Decompose

A slice is the set of behaviours sharing a seam that cannot be split further without leaving the product broken.

Slices are vertical.
Each one is checkable by someone using the product, because each one claims behaviours from the spec, and the spec's behaviours are checkable by construction.
Never slice by layer.
"Add the data layer" can be read but it cannot be checked, and that is the failure this skill exists to prevent.

Two exceptions to vertical, both named by kind:

- **Prefactor** goes first as its own slice, when the feature slices would each carry the same structural change.
  It claims no behaviours unless the change is observable.
- **Wide refactors** sequence as `expand`, then `migrate` in batches sized by blast radius, then `contract`.
  Expand adds the new path beside the old one.
  Each migrate moves one batch of callers.
  Contract removes the old path.

Split when a slice needs more than one seam, or claims more than about three behaviours.
Do not split to look thorough.
A one-slice file is a legitimate answer when the spec is one piece of work.

A field you cannot fill is a slice you have not scoped yet.
If you cannot name the seam, the checks, or the blockers, the slice is wrong, not the field.

**Edges are technical, not product.**
`S2` is blocked by `S1` only when `S2` cannot be built or tested until `S1`'s code exists.
The spec's Sequence section is product ordering and is not an edge.

The graph is a DAG, not a list.
A graph in which every slice blocks the next is a list that took longer to write.
Treat it as a sign the decomposition is wrong and look for the edge that is not real.

**Autonomy is mechanical.**
A slice is `hitl` when its `done.manual` list is non-empty, or when the slice needs an action an agent cannot perform: rotating a secret, clicking through a consent screen, approving a deploy, anything behind a login the agent does not hold.
Otherwise it is `afk`.
Never set it by judgement.
"Feels risky" is not a trigger, because a flag a runner cannot trust is ignored after its first wrong call.

`autonomy` says nothing about blocking and `blocked_by` says nothing about autonomy.
Keep them orthogonal.

## Step 4: The outline

Before any field beyond the title exists, show the outline and stop.

One line per slice: id, kind, title, blockers.

```
S1  prefactor  Extract the parser into its own module    blocked by: none
S2  feature    Parse the header line                     blocked by: S1
S3  feature    Reject a malformed header                 blocked by: S1
S4  feature    Surface the parse error in the UI         blocked by: S2, S3
```

Then ask three questions, and only these three:

1. Is the granularity right?
2. Are the edges right?
3. Should any slice be merged or split?

Wait for the answer.
Granularity is cheap to fix before the fields exist and tedious after.
Apply the corrections, and if the outline changed, show it once more.

## Step 5: Land it

Propose `.scratch/slices/<slug>.json`, where `<slug>` is the spec's filename without its extension, and confirm the path before writing.
If the repo clearly has its own home for documents like this, offer that instead and let the user pick.
Never invent a convention in someone else's repo.

Check whether `.scratch/` is ignored by git.
If it is not, offer to add it.
Never edit `.gitignore` uninvited.

Write the file in this shape:

```json
{
  "spec": ".scratch/specs/<slug>.md",
  "commit": "<sha>",
  "branch": "<branch>",
  "slices": [
    {
      "id": "S1",
      "kind": "feature",
      "title": "<imperative phrase>",
      "behaviours": [1, 2],
      "seam": "<file:line from the spec's Seams section>",
      "blocked_by": [],
      "autonomy": "afk",
      "done": { "automated": ["<check>"], "manual": [] }
    },
    {
      "id": "S2",
      "kind": "prefactor",
      "title": "<imperative phrase>",
      "behaviours": [],
      "seam": "<file:line from the spec's Seams section>",
      "blocked_by": [],
      "autonomy": "afk",
      "done": { "automated": ["<check>"], "manual": [] },
      "scope": "<what this touches and what it leaves alone>"
    }
  ]
}
```

Field by field:

- `spec` is the path the spec was read from.
- `commit` and `branch` are the stamp from Step 2.
- `id` is `S` followed by a number, assigned in outline order.
- `kind` is one of `feature`, `prefactor`, `expand`, `migrate`, `contract`.
- `title` is an imperative phrase.
- `behaviours` holds numbers from the spec's Behaviour list, never the text.
  The file names the spec and the reader goes there, so there is one source of truth.
- `seam` is one `file:line` string copied verbatim from the Seams section, or the exact phrase the spec uses for a new seam.
- `blocked_by` lists ids of slices whose code must exist first.
- `autonomy` is `afk` or `hitl`, set by the rule in Step 3.
- `done.automated` lists checks a machine runs.
  `done.manual` lists what a person has to look at.
- `scope` is free text and appears only on non-feature kinds.
  Feature slices omit the key.

The slices file is the only artifact.
No notes, no summary, no second copy.

## Step 6: Self-check

After writing, read the file back and walk every rule below against it.

1. **Coverage.** Every number in the spec's Behaviour list is claimed by exactly one slice. No gaps, no duplicates, no numbers the spec does not have.
2. **Seam.** Every slice names exactly one seam, and that string appears verbatim in the spec's Seams section.
3. **Kind.** Every `kind` is one of the five. Only non-feature kinds carry `scope`.
4. **Edges.** Every id in a `blocked_by` list exists in the file, no slice blocks itself, and the graph has no cycles.
5. **Connectivity.** A slice claiming zero behaviours is connected through `blocked_by`, in either direction, to a slice claiming at least one.
6. **Autonomy.** `hitl` exactly when `done.manual` is non-empty or the slice needs an action an agent cannot perform, `afk` otherwise.

Report every violation, one per line, in the form `S3: claims behaviour 4, already claimed by S2`.
Fix them, rewrite the file, and walk the rules again.
Declare the file done only when a pass reports nothing.

No script checks this for you.
The rules are prose and you are the checker, so walk them literally rather than by feel.

## Rules that do not bend

- Never implement anything. Not a slice, not a prefactor, not a one-line fix you noticed on the way.
- Never derive Behaviour or Seams. A spec without them goes back to `write-spec`.
- Never copy behaviour text into the file. Numbers only.
- Never set `autonomy` by judgement.
- Never treat the spec's Sequence as blocking edges.
- Never edit an existing slices file in place. Regenerate it.
- Confirm the path before writing, and leave nothing behind but the file.
