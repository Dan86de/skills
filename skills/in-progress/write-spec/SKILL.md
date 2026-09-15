---
name: write-spec
description: Turn a settled plan or decision record into a spec, grounded in the codebase and written to .scratch/specs.
disable-model-invocation: true
---

# Write Spec

Turn what is already settled into a document that outlives the conversation that settled it.

You are not deciding anything here.
Every decision this document records was made before you started.
Your job is to state them, ground them in the code, and add the parts nobody argued about because nobody had to.

That last part is the whole reason this skill exists.
A decision record is lossy on purpose: it keeps what was contested and drops what was not.
A spec carries both.

## When this is the wrong tool

If the work can be implemented in the context that decided it, say so and offer to implement instead.
A two-page spec for a one-file change is how people stop trusting the skill.

Say it once.
If the user wants the spec anyway, write the spec.

## Step 1: Take the input

Work from what is already in the conversation.

Do not interview the user.
Every question you are tempted to ask about intent belongs to the `interview` skill, which runs before this one and may already have run.

If an argument names a file, an issue, or a URL, read it in full before anything else.
A decision record is the ideal input, not a required one.

## Step 2: Ground it in the code

The spec has to state what the conversation never questioned: what exists today, and where this gets tested.
Only the codebase has those.

Run three searches.
If your harness can run parallel subagents, dispatch one per role and run them concurrently.
If it cannot, do all three yourself.

- **Locate**: where the affected code lives.
- **Analyze**: how the current implementation actually works, traced rather than guessed.
- **Prior art**: the closest existing feature of the same shape, and the tests covering it.

Each role is a documentarian, not a critic.
Describe what exists.
Do not propose improvements, identify problems, or suggest a design.
A grounding pass that starts designing has pre-decided the thing the user already decided, and the spec will quietly contradict the record it came from.

Then settle the **seams**: the points at which this feature gets tested.
Prefer an existing seam to a new one.
Prefer the highest seam available.
Fewer seams is better, and one is ideal.

Check the seams with the user before writing.
This is the decision that most shapes the implementation, and it is the one an interview almost never surfaces.

## Step 3: Write the spec

Ten sections, in this order, every time.

<spec-template>

## Problem

The problem, from the user's perspective.
Observable: who hits it, how often, how you know.
Not a missing feature.

## Solution

What changes for the user.
The narrowest version still worth shipping.

## Current state

What exists today in the code this touches, with `file:line`.
Constraints found while grounding.
What is missing.

## Behaviour

A numbered list of statements that are true once this works.
Each one checkable by someone using the product.
One line per behaviour, no roles and no motives: the "as an actor, I want a feature, so that a benefit" framing costs three clauses to encode one fact that is identical on every line.

## Decisions

Each decision, what was chosen, and the alternative that lost with the reason it lost.
A record of only the winners cannot defend itself in three months.

No file paths and no code.
Exception: a snippet that encodes a decision more precisely than prose can, such as a schema, a state machine, or a type shape.
Inline it, trimmed to the decision-rich part.

## Seams

Where this gets tested, with `file:line` for seams that already exist.
New seams named, with the reason an existing one would not do.

## Sequence

The order the behaviour arrives in, from the user's point of view.
Product ordering only: no work units, no blocking edges, no technical dependencies.
Those get decided against the architecture by whatever decomposes this next.

More than about seven entries means the scope got wide.
Say so rather than emitting twelve.

## Out of scope

Named, so it cannot creep back in.

## Accepted breakage

What breaks or gets worse, and why that is acceptable.
An empty section means you have not looked.

## Done means

- **Automated**: what a machine can check.
- **Manual**: what a person has to look at.

</spec-template>

One rule governs the whole document.
**Facts about today carry citations. Decisions about tomorrow carry none.**
Current state and Seams cite `file:line`.
Decisions and Sequence never do, because file paths and code snippets go stale faster than anything else in the document.

## Step 4: Land it

Propose `.scratch/specs/<slug>.md` and confirm the path before writing.
If the repo clearly has its own home for documents like this, offer that instead and let the user pick.
Never invent a convention in someone else's repo.

Check whether `.scratch/` is ignored by git.
If it is not, offer to add it.
Never edit `.gitignore` uninvited.

The spec file is the only artifact.
No research notes, no summary, no second copy.

## Rules that do not bend

- Never interview. Everything you want to ask was decided before you got here.
- The grounding pass describes. It does not design.
- Never cite a file path in Decisions or Sequence.
- Never put work units or blocking edges in Sequence.
- Confirm the path before writing, and leave nothing behind but the spec.
