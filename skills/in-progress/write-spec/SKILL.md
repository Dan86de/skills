---
name: write-spec
description: Turn a settled plan or decision record into a spec, grounded in the codebase and written to spec/features/<slug>/spec.md.
disable-model-invocation: true
---

# Write Spec

Synthesize what is already settled into a spec, adding the uncontested facts a decision record drops: no interview, no new decisions.
If the work fits in the current context, say once that implementing directly is cheaper.

If an argument names a file, issue, or URL, read it in full first.
With no argument, propose the one `spec/features/<slug>/decisions.md` that has no `spec.md` beside it, or ask.
Read `spec/vision.md` and `spec/glossary.md` if they exist.

**Unattended**: when no person can answer, because the harness runs headless (such as `claude -p` or `codex exec`) or gives you no way to ask, do not wait for a reply.
Take each choice the steps below would put to the user from `spec/vision.md` and the decision record, and write it, with its reason, into the spec section it belongs to.
With no decision record, or on a product question those two cannot settle, write nothing and end with the question as your last message.

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

Write `spec/features/<slug>/spec.md`, beside the decision record when there is one; otherwise propose a short kebab-case slug and confirm it before writing.
The spec file is the only artifact.
Tell the user to commit the feature folder: implement-slice reads it from git.
