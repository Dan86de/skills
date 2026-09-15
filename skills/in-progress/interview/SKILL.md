---
name: interview
description: Settle every decision behind a plan before anything gets built, in rounds rather than one question at a time. Opens with a kill condition that can end the session in a cut, closes with a decision record. Use when a plan, feature, or design needs pressure-testing before a spec exists, when the user says "interview me", "grill me", "pressure-test this", "poke holes in this", or "before we plan this", and when another skill needs the decisions settled before it writes anything.
---

# Interview

Settle a plan before it gets built.
You are not gathering requirements and you are not being agreeable.
You are finding the decisions that are load-bearing and refusing to move until each one is settled.

This skill does not write the code, the spec, or the tickets.
It produces a decision record and stops.

## The three objects

**Design tree.** The subject, structured as decisions. Every decision branches into the decisions that hang off it.

**Frontier.** Every decision whose prerequisites are already settled, and nothing else. A question whose answer could change once some other open question is answered is not on the frontier.

**Round.** One whole frontier, asked at once, answered at once.

Rounds are why this is cheap.
Thirteen questions land in about three rounds instead of thirteen turns.

## Step 0: Recon

Before the first question, find out what the environment already tells you.
Read the code, the existing docs, the glossary if the repo has one, and whatever the user pointed at.
Keep it bounded: enough to ask grounded questions, not a full audit.

Report it back in three or four lines, then go straight to round zero.
No preamble, no announcing your plan.

A grounded question beats an abstract one every time.
_"`OrderService` cancels whole orders only. You said partial cancellation is in scope. Which is right?"_ is worth ten of _"how should cancellation work?"_

## Step 1: Round zero

Three questions, fixed, asked once, in this order.
Never revisited later.

1. **The pain.** What is happening today that should not be, stated as something observable. Not a missing feature. Who hits it, how often, and how you know.
2. **The wedge.** The narrowest thing that relieves that pain. Not the good version, the smallest version that is still worth shipping.
3. **The kill condition.** The claim this rests on that could turn out to be false. If it were false, would you still build this?

If the kill condition is already false, or the wedge collapses to nothing, the session ends in a **cut**.

A cut is a successful outcome, not a failure.
Write it up: the premise, why it does not hold, what would have to change for it to hold.
Do not soften a cut into a smaller version of the same idea.

After round zero you stop asking whether.
Everything from here is how.

## Step 2: Rounds

Ask the whole frontier.
Number each question, give it a title, and give your recommended answer.

```
❓ **Q1** - **<title>**: <the question, as long as it needs to be, options included>

➡️ <your recommended answer, and why>

---

❓ **Q2** - **<title>**: <the question>

➡️ <your recommended answer, and why>
```

Then wait.

Every answer reshapes the tree.
Settled decisions push the frontier outward and unblock what depended on them.
Recompute the frontier and ask the next round.

The frontier is your judgement, not a computed graph.
When you are unsure whether two questions in a round are independent, they are not.
Put the second one in a later round.

## Facts and decisions

**Facts are yours to find, never the user's.**
If your harness can run parallel sub-agents, dispatch one per fact and keep asking the rest of the frontier while it runs.
If it cannot, go find the fact yourself.
Either way a fact in flight is an unsettled prerequisite: only the questions downstream of it wait.

**Decisions are the user's.**
Put each one to them and wait for an answer.

Answering your own decision question breaks this skill.
A recommendation is not an answer.

## Step 3: The sweep

Before you declare the frontier empty, run this sweep.
These four are almost always underspecified and almost never volunteered.

- **What we are explicitly not doing.** Named, so it cannot creep back in.
- **What breaks that we are choosing to accept.** Every plan has these. An empty answer means you have not looked.
- **How we know it worked.** Split into what a machine can check and what a person has to look at.
- **What makes this reversible.** What it costs to undo, and what would make you undo it.

Anything the sweep surfaces goes back on the frontier as a real question.
Then sweep again.

## Step 4: The decision record

The session ends when the frontier is empty, the sweep is clean, and the user confirms you have reached a shared understanding.
Frontier-empty alone is not the end.

Then emit this into the conversation.
Do not write it to disk unless the user asks.

```markdown
## Decision record: <subject>

**Pain**: <from round zero>
**Wedge**: <from round zero>
**Premise**: <the kill condition, and the fact it survived>

### Settled
- **<decision>**: <what was chosen>. Rejected: <alternative> because <reason>.

### Found during recon
- <fact, with file:line or source>

### Not doing
- <item>

### Accepted breakage
- <what breaks, and why that is fine>

### Done means
- Automated: <checkable>
- Manual: <someone has to look>

### Reversibility
<cost to undo, and the signal that would trigger it>
```

Rejected alternatives carry the reasoning.
A record of only the winners is a record that cannot defend itself in three months.

## Rules that do not bend

- Every question ships with your recommended answer.
- Never ask for something you could have read.
- Never ask for a number the user cannot feel. Ask for the sensation or a reference, then propose the number yourself.
- A cut is a success.
- Do not act on any of it until the user confirms.
