---
name: interview
description: Settle every decision behind a plan before anything gets built, in rounds. Opens with a kill condition that can end in a cut, closes with a decision record. Use when a plan, feature, or design needs pressure-testing before a spec exists, when the user says "interview me", "grill me", "pressure-test this", "poke holes in this", or "before we plan this", and when another skill needs the decisions settled before it writes anything. Draws the design tree as a page when it grows or when asked to "show me the tree".
---

Interview the user relentlessly until every load-bearing decision is settled, then emit a decision record and stop.

Map the subject as a **design tree**: every decision branches into the decisions that hang off it.
The **frontier** is every decision whose prerequisites are already settled.
A **round** asks the whole frontier at once.
When unsure whether two questions are independent, they are not: put the second in a later round.

## 1. Recon

Read the code, docs, glossary, and whatever the user pointed at, enough to ground every question in what exists.
Report it in three or four lines, then go straight to round zero.

## 2. Round zero

Three fixed questions, asked once, never revisited:

1. **The pain**: what observably goes wrong today, who hits it, how often, and how you know.
2. **The wedge**: the smallest version still worth shipping.
3. **The kill condition**: the claim this rests on that could be false. If it were false, would you still build this?

If the kill condition is already false or the wedge collapses to nothing, the session ends in a **cut**, which is a success.
Write up the premise, why it fails, and what would have to change, without shrinking it into a smaller version of the same idea.
After round zero, everything is how, not whether.

## 3. Rounds

Ask the whole frontier, numbered, each with your recommended answer:

```
❓ **Q1** - **<title>**: <the question, as long as it needs to be, options included>

➡️ <your recommended answer, and why>

---

❓ **Q2** - **<title>**: <the question>

➡️ <your recommended answer, and why>
```

Then wait for answers, recompute the frontier, and ask the next round.

Facts are yours to find: dispatch a sub-agent per fact if your harness can, otherwise look yourself, and only questions downstream of a fact in flight wait.
Decisions are the user's: a recommendation is never an answer.
For a number the user cannot feel, ask for the sensation or a reference and propose the number yourself.

Once the tree holds eight or more decisions, or the user asks to see it, read [references/tree.md](references/tree.md) and keep a picture of it.

## 4. The sweep

Before declaring the frontier empty, check these four:

- **Not doing**: named, so it cannot creep back in.
- **Accepted breakage**: every plan has some.
- **Done means**: what a machine can check, and what a person has to look at.
- **Reversibility**: the cost to undo, and the signal that would trigger it.

Anything it surfaces goes back on the frontier, then sweep again.

## 5. The decision record

The session ends when the frontier is empty, the sweep is clean, and the user confirms a shared understanding.
Emit this into the conversation, not to disk unless asked.
If you kept a picture, render it once more with every node settled, not doing, or cut, and give its path under the record.

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

Act on none of it until the user confirms.
