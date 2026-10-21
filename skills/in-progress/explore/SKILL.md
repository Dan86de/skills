---
name: explore
description: Map a topic as an interactive mind map so the user finds what they did not know to ask, then grow it branch by branch on request. Writes a map file and renders it to one HTML page with a script, no hand-written HTML. Use when the user wants to explore, map, or get oriented in a topic, asks "what am I missing", "what don't I know about X", "give me the landscape of X", "map this out", or says "go deeper on" a node of an existing map, and when another skill needs a tree drawn as a page.
---

# Explore

Map a topic so the user can see what they did not know to ask.
The deliverable is a map file and the page rendered from it, not an essay.

The map is data.
You write it, `scripts/map.mjs` checks and renders it.
Never write the HTML yourself, and never skip the check.

## The script

`scripts/map.mjs` sits next to this file.
It needs Node 18 or newer and nothing else.

```
node <this skill's folder>/scripts/map.mjs check   <map.json>
node <this skill's folder>/scripts/map.mjs outline <map.json>
node <this skill's folder>/scripts/map.mjs render  <map.json> [--out <file.html>]
```

`check` prints errors and warnings and exits 1 on any error.
`outline` prints the tree as indented text, which is how you read a map back, instead of reading the JSON.
`render` runs the check first and writes the page beside the map unless `--out` says otherwise.

The format is in [references/map-format.md](references/map-format.md).
Read it before writing your first map in a session.

## Where maps live

`.scratch/maps/<slug>/map.json` in the current project, with `map.html` rendered beside it.
Outside a project, or when the user names a place, use that.
One topic, one folder.

## Step 0: The lens

A map without a lens is a table of contents.
The lens is who the map is for and what it will feed: a decision, a build, a talk, a hire.
It decides which branches matter and which nodes get suggested.

If the conversation already gives you the topic and the lens, do not ask.
Otherwise ask one question that gets both, then start.

Note what the user already knows.
Those things can still appear, but they are never the suggested nodes.

## Step 1: The first map

Shape: one centre, four to six branches, three to six nodes per branch.
Twenty to thirty-five nodes in all.
A bigger first map gets skimmed, and a skimmed map hides the one node that mattered.

Branches are angles on the topic, not chapters of a textbook.
Pick the angles the lens needs from these, or name better ones:

- the vocabulary everything else is built from
- laws, models and rules of thumb
- tools and methods, including how to draw or measure it
- failure modes and the anti-patterns that cause them
- adjacent fields that solved the same problem under another name
- where the experts disagree
- the people and primary sources at the root of it

**The unknown-unknowns test.**
For each node ask: would the user have typed this into a search box on their own?
If yes, it is a known unknown: fine to include, not the point.
At least a third of the nodes must fail that test.
Those are what the map is for.

**Suggested.**
Mark three to five nodes `suggested`: the ones with the most leverage for this lens.
Spread them across branches.
Each one gets a full panel.

**Every node** gets a `summary`: one sentence, plain words, no jargon the node does not define.

**Suggested nodes and anything non-obvious** also get:

- a `body`: the definition, then one concrete example from the user's own world, with numbers where numbers exist
- an `ask`: one question the user can put to their own situation today

**Links** join nodes in different branches where reading one changes how you read the other.
Three to eight per map.
A link because two things are vaguely related is noise.

**Facts.**
Laws, numbers, names and attributions get checked against a source before they go in, using whatever search your harness has.
Put what you used in `sources`.
Never invent a source.
If you cannot check a claim, state it more generally or leave it out.

## Step 2: Render and hand over

1. Write `map.json`.
2. Run `check`. Fix every error. Fix warnings unless you have a reason not to.
3. Run `render`.
4. Open the page if your harness can open files or a browser, otherwise give the path.

Then reply in three or four lines: how many nodes, which ones are suggested and why in a phrase, and how to continue.
How to continue is always the same: click a label to read it, and use the panel's copy button or just say "go deeper on <node>".
Do not repeat the map in the chat.
The page is the map.

## Step 3: Grow it

The map grows from what the user picks, not from what you think is next.

- **"Go deeper on X."** Run `outline`. Add three to six children under X, held to the same unknown-unknowns test. Suggest one or two of them. Add links where the new nodes touch other branches.
- **"What am I missing?"** Run `outline`, look for angles from Step 1 that the map does not cover yet, and add a branch or nodes for them. Say in one line what you added and why.
- **"Connect X and Y"**, or any question about how two nodes relate: answer in chat, then add the link if it holds.
- **A node that has become a topic of its own**, or a branch more than four levels deep: start a new map in its own folder with that node as the centre, and say so.

After every change: `check`, `render`, and tell the user what changed in one line.

Ids are stable.
Never rename or remove a node the user has already seen, unless they ask.
Removing one breaks the links that point at it, and `check` will tell you.

## Drawing a tree for another skill

Another skill can call this one to turn its own tree into a page, with its own states and labels.
When that happens, skip Steps 0, 1 and 3.
Take the map file the calling skill wrote, or write it from the tree it handed you, following the format reference, including any custom `states`.
Run `check`, then `render`, and return the page's path.
Do not add nodes, suggestions or links of your own.

## Rules that do not bend

- The map is the answer. The chat is the cover note.
- Every node earns its place against the lens.
- A third of the map is things the user would not have searched for.
- Checked facts or no facts.
- The script renders. You never write the HTML.
