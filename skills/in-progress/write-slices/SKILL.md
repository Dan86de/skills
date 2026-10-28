---
name: write-slices
description: Decompose a spec written by write-spec into vertical slices with blocking edges, one JSON file written beside it as spec/features/<slug>/slices.json.
disable-model-invocation: true
---

# Write Slices

Cut a spec into reviewable slices with blocking edges, written as one JSON file.

## 1. Take the spec

Take the path from the invocation.
If none was given and exactly one `spec/features/<slug>/spec.md` has no `slices.json` beside it, propose it; otherwise ask.

If the spec lacks a **Behaviour** or **Seams** section, name it, tell the user to run `/write-spec`, and end the turn.

## 2. Check the seams

Check that every `file:line` in Seams exists.
A seam the spec marks as new has none; use the spec's exact phrase for it.
If any file is missing, list every missing seam, tell the user to fix the spec, and end the turn.

Record the commit SHA and branch.

Look for a **verification skill**: a project skill, in `.agents/skills/` or a harness's skills folder, whose `SKILL.md` says it runs the product and records whether a check passed.

## 3. Decompose

A slice is the behaviours sharing one seam that cannot be split further without breaking the product.
Slices are vertical, each checkable by someone using the product, never a layer.
The non-vertical kinds:

- `prefactor` goes first when every feature slice would carry the same structural change.
- Wide refactors run `expand`, `migrate` in batches sized by blast radius, then `contract`.

Split when a slice needs a second seam or claims more than about three behaviours.
A field you cannot fill means the slice is wrong.

**Edges are technical**: `S2` is blocked by `S1` only when it cannot be built or tested until `S1`'s code exists.
The spec's Sequence section is not edges, and a chain where every slice blocks the next hides an edge that is not real.

**Autonomy is mechanical**: `hitl` when `done.manual` is non-empty or the slice needs an action an agent cannot perform, such as a secret, consent screen or deploy approval; otherwise `afk`.

With a verification skill, every check it can run goes in `done.automated` as verify steps, even if the spec filed it under Manual.
`done.manual` keeps only human judgement of how something looks or reads.

## 4. Outline

Before filling fields, show one line per slice, `S2  feature  Parse the header line  blocked by: S1`, and ask:

1. Is the granularity right?
2. Are the edges right?
3. Should any slice be merged or split?

Wait, then apply corrections.

## 5. Write the file

Write `spec/features/<slug>/slices.json`, beside the spec.
Regenerate an existing slices file whole.
Tell the user to commit the feature folder: implement-slice reads it from git.

```json
{
  "spec": "spec/features/<slug>/spec.md",
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
    }
  ]
}
```

- `id`: `S` plus a number, in outline order.
- `kind`: `feature`, `prefactor`, `expand`, `migrate` or `contract`.
- `behaviours`: numbers from the spec's Behaviour list, never text.
- `seam`: copied verbatim from Seams.
- `blocked_by`: ids whose code must exist first.
- `done.automated`: checks a machine runs. `done.manual`: what a person must look at.
- Non-feature kinds also carry `scope`: free text on what the slice touches and leaves alone.

## 6. Self-check

Read the file back and check:

1. Every Behaviour number is claimed by exactly one slice, and no others appear.
2. Every `seam` appears verbatim in Seams.
3. Only non-feature kinds carry `scope`.
4. `blocked_by` ids exist and form no cycle.
5. A slice claiming no behaviours connects through `blocked_by` to one that claims some.
6. `autonomy` follows step 3.
7. With a verification skill, no `done.manual` item is a check that skill can run.

Report each violation on its own line, like `S3: claims behaviour 4, already claimed by S2`, fix, and repeat until clean.

The slices file is the only output: implement nothing.
