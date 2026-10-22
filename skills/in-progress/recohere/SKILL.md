---
name: recohere
description: Find where a codebase does the same thing more than one way, rank each by how much it slows the next change, and finish the migration you pick.
disable-model-invocation: true
---

**Decoherence** is locally valid code built on models that disagree: two HTTP clients, three error shapes, a migration left half done.
Each one makes every later change translate between models, and it grows with change, not with time.
This skill finds it and finishes one migration completely, because a migration left half done is more decoherence.

## Steps

1. **Scope to where change happens.**
   If the user named an area, take it.
   Otherwise walk `git log` back a few hundred commits and rank directories by how often they change; decoherence only costs where people keep working.
   Read the glossary (`spec/glossary.md`), ADRs and standards in scope first.

2. **Find the candidates.**
   Look for each of these, in the scope:
   - **parallel models**: more than one way to do one job, such as fetching, errors, validation, dates, config, state, logging, test setup
   - **half migrations**: a new pattern some callers use and others do not, often with a TODO, a `legacy` or `v2` name, or a shim
   - **drifted terms**: one domain concept under several names across code, schema and UI

   For each, count the call sites of every model with `grep` or the language's own tools, and note which files changed in the last 90 days.
   The **dominant model** is the one most recent changes use, not always the one with most call sites.

3. **Rank** by drag: call sites on the losing models, times how often those files change.
   Drop candidates the repo has an ADR for, unless the drag is real enough to reopen it, and say so.

4. **Report** to `.scratch/recohere/<YYYY-MM-DD>.md`, one entry per candidate, worst first:

   ```markdown
   ## <n>. <concern>: <winning model> over <losing models>

   - Models: <model> - <call sites> sites, <files>; <model> - ...
   - Drag: <changes to those files in 90 days>
   - Finish line: <what is true when one model is left>
   - Guard: <the lint rule, type, or check that stops the losing model coming back>
   - Size: <small | medium | large>
   ```

   Show the user the top three and ask which to finish.

5. **Finish the one they pick.**
   Call the Skill tool with "interview" to settle the finish line, the winner, and the order.
   A migration is finished when the losing models are deleted and the **guard** is in place, so nobody, human or agent, reintroduces them.
   Plan the whole migration, even when it runs as several slices: once the interview closes, tell the user to run `/write-spec` on its decision record.

Scope creep is the risk: one concern per run, finished completely.
