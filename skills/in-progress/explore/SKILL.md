---
name: explore
description: Map a topic as an interactive mind map so the user finds what they did not know to ask, then grow it branch by branch on request. Writes a map file and renders it to one HTML page with a script, no hand-written HTML. Use when the user wants to explore, map, or get oriented in a topic, asks "what am I missing", "what don't I know about X", "give me the landscape of X", "map this out", or says "go deeper on" a node of an existing map, and when another skill needs a tree drawn as a page.
---

You write the map as JSON; `scripts/map.mjs` (next to this file, Node 18+) checks and renders it:

```
node <this skill's folder>/scripts/map.mjs check|outline|render <map.json> [--out <file.html>]
```

Read [references/map-format.md](references/map-format.md) before your first map in a session.
Read maps back with `outline`.
Maps live at `.scratch/maps/<slug>/map.json`, one folder per topic, unless the user names a place.

## 1. Lens

The lens is who the map is for and what it feeds: a decision, a build, a talk, a hire.
If the conversation lacks the topic or lens, ask one question for both.
Note what the user already knows: never suggest it.

## 2. First map

One centre, four to six branches of three to six nodes, 20 to 35 nodes in all.
Branches are angles the lens needs: vocabulary, laws, tools and measures, failure modes, adjacent fields, expert disagreements, primary sources.

- At least a third of nodes are **unknown unknowns**: things the user would never have searched for.
- Every node gets a one-sentence plain `summary`.
- Three to five highest-leverage nodes, across branches, are `suggested`.
- Suggested and non-obvious nodes add a `body` (definition, then a concrete example from the user's world, with numbers) and an `ask` (one question for their situation).
- Three to eight cross-branch `links`, only where one node changes how you read the other.
- Check laws, numbers, names and attributions against a real source and list it in `sources`. Generalise or cut what you cannot check.

## 3. Hand over

Run `check`, fix all errors and warnings you have no reason to keep, then `render` and open the page or give its path.
Reply in three or four lines: node count, each suggested node with a phrase, and how to continue (click a label, then copy the panel prompt or say "go deeper on <node>").

## 4. Grow

- **"Go deeper on X"**: `outline`, add three to six unknown-unknown children under X, suggest one or two, link across branches.
- **"What am I missing?"**: `outline`, add nodes or a branch for uncovered angles, say what in one line.
- **How two nodes relate**: answer in chat, add the link if it holds.
- **A node grown into its own topic, or a branch past four levels**: start a new map centred on it, and say so.

After every change: `check`, `render`, one line on what changed.
Ids are stable: keep every node the user has seen unless they ask.

## Drawing a tree for another skill

Take the tree or map file as given, custom `states` included, adding nothing of your own.
Run `check` and `render`, then return the page's path and the exact `render` command for the caller to re-run.
