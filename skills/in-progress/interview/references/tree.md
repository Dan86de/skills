# Drawing the design tree

The picture is a map file at `.scratch/interviews/<slug>/tree.json`, rendered to `tree.html` beside it.
The first time, call the Skill tool with "explore" and ask it to draw the tree: it owns the format and the script, and tells you the render command.
After every round, rewrite `tree.json` and re-run that command.
If explore is not installed, skip the picture.

Mapping:

- **Centre**: the subject.
- **Branches**: round zero (pain, wedge, kill condition), then one per top-level decision, then the sweep once it starts.
- **Children**: the decisions that hang off a decision. One with two prerequisites sits under one and `links` to the other.
- **`summary`**: the question while open, the chosen answer once settled.
- **`body`**: the options, and for settled ones the rejected alternatives with their reasons.
- **`ask`**: the question exactly as asked this round, frontier nodes only.

Put these in the file so the legend reads as the interview:

```json
"states": {
  "settled":  { "label": "Settled",                   "mark": "filled", "tone": "ok" },
  "frontier": { "label": "In this round",             "mark": "ring",   "tone": "accent" },
  "waiting":  { "label": "Waiting on another answer", "mark": "dashed", "tone": "muted" },
  "fact":     { "label": "Fact being checked",        "mark": "dashed", "tone": "warn" },
  "not-doing":{ "label": "Not doing",                 "mark": "cross",  "tone": "muted" },
  "cut":      { "label": "Cut",                       "mark": "cross",  "tone": "danger" }
},
"kicker": "Interview",
"askLabel": "Asked this round",
"promptTemplate": "About {label} ({id}): ",
"promptLabel": "Copy a reply about this decision"
```

The rounds still happen in the conversation; after each one, a line with the page's path is enough.
