---
name: write-spec
description: Turn a settled plan or decision record into a spec, grounded in the codebase and written to .scratch/specs.
disable-model-invocation: true
---

# Write Spec

Synthesize what is already settled into a spec, adding the uncontested facts a decision record drops: no interview, no new decisions.
If the work fits in the current context, say once that implementing directly is cheaper.

If an argument names a file, issue, or URL, read it in full first.

## 1. Ground it in the code

Run three searches, as parallel subagents if your harness has them:

- **Locate**: where the affected code lives.
- **Analyze**: how the current implementation works, traced.
- **Prior art**: the closest existing feature of the same shape, and its tests.

Each is a documentarian: describe, never design.
Also look for a **verification skill**: a project skill (in `.agents/skills/` or a harness skills folder) whose `SKILL.md` says it runs the product and records whether a check passed.

Then sketch the **seams** where this gets tested.
Prefer existing seams, the highest one available, and as few as possible; one is ideal.
Check the seams with the user before writing.

## 2. Write the spec

Use these sections, in order, with these exact names.
Facts about today cite `file:line` (Current state, Seams); Decisions and Sequence never do.

<spec-template>

## Problem

The problem from the user's perspective, observable: who hits it, how often, how you know.

## Solution

What changes for the user, in the narrowest version still worth shipping.

## Current state

What exists today, with `file:line`, plus constraints and what is missing.

## Behaviour

A numbered list of statements true once this works, one line each, each checkable by someone using the product.
No "as an actor, I want" framing.

## Decisions

Each decision, the alternative that lost, and why it lost.
No file paths or code, except a trimmed snippet (schema, state machine, type shape) that encodes a decision more precisely than prose.

## Seams

Where this gets tested: `file:line` for existing seams, and for each new seam the reason no existing one would do.

## Sequence

The order behaviour arrives in, from the user's point of view.
Product ordering only: no work units or blocking edges.
Past about seven entries, say the scope got wide.

## Out of scope

Named, so it cannot creep back in.

## Accepted breakage

What breaks or gets worse, and why that is acceptable.

## Done means

- **Automated**: what a machine can check.
- **Manual**: what a person has to look at.

</spec-template>

With a verification skill, read its `SKILL.md`, then put every check it can run under **Automated** as agent steps, such as "verify: submit the signup form, the dashboard greets the new account, and one `accounts` row exists".
**Manual** keeps only judging look and feel, or actions no agent can perform.

## 3. Land it

Propose `.scratch/specs/<slug>.md`, or the repo's own home for such documents if it clearly has one, and confirm the path before writing.
If `.scratch/` is not git-ignored, offer to add it; edit `.gitignore` only with consent.
The spec file is the only artifact.
