# Map format

One JSON file per map.

```json
{
  "title": "Systems thinking",
  "lens": "for a product engineer deciding what to build",
  "nodes": [
    { "id": "systems-thinking", "label": "Systems thinking", "summary": "..." },
    { "id": "core-elements", "label": "Core elements", "parent": "systems-thinking", "summary": "..." },
    {
      "id": "stocks-and-flows",
      "label": "Stocks and flows",
      "parent": "core-elements",
      "state": "suggested",
      "summary": "A stock accumulates. A flow fills or drains it.",
      "body": "**Stock:** a thing you can count at one moment.\n\n- A stock changes only through its flows.",
      "ask": "What is the stock here, and which flow do I change?",
      "links": ["littles-law"],
      "sources": [{ "title": "Thinking in Systems", "url": "https://..." }]
    }
  ]
}
```

## Top level

| Key | Required | Meaning |
| --- | --- | --- |
| `title` | yes | Page title, shown top left. |
| `nodes` | yes | Flat array. The tree comes from `parent`. |
| `lens` | no | Shown under the title. |
| `kicker` | no | Small label above the title. Default "Map". |
| `chrome` | no | `false` hides the corner handle. |
| `states` | no | Custom node states, merged over the defaults. |
| `askLabel` | no | Heading for `ask`. Default "Question to ask". |
| `promptTemplate` | no | What the panel's copy button copies. Fills `{label}`, `{id}`, `{title}`. |
| `promptLabel` | no | Copy button text. |
| `prompt` | no | `false` hides the copy button. |

## Node

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Unique lowercase kebab-case. Never rename once rendered. |
| `label` | yes | Under 40 characters. |
| `parent` | all but the centre | Parent id. Exactly one node has none. |
| `state` | no | A key of `states`. None draws a hollow dot. |
| `summary` | recommended | One sentence, shown first in the panel. |
| `body` | no | Short. Only `**bold**`, `` `code` ``, `[text](https://...)`, `- ` bullets and blank-line paragraphs. |
| `ask` | no | One question for the reader's own situation. |
| `links` | no | Ids anywhere in the tree. Dashed lines, listed both ways. |
| `sources` | no | `[{ "title", "url" }]`, http(s) only. |

Children render in array order.

## States

Defaults: `open` (hollow dot, same as no state) and `suggested` (filled accent dot).
Another skill can define its own:

```json
"states": {
  "settled":  { "label": "Settled",   "mark": "filled", "tone": "ok" },
  "frontier": { "label": "Ask next",  "mark": "ring",   "tone": "accent" },
  "blocked":  { "label": "Waiting",   "mark": "dashed", "tone": "muted" },
  "cut":      { "label": "Cut",       "mark": "cross",  "tone": "danger" }
}
```

- `mark`: `filled`, `hollow`, `ring`, `dashed`, `cross`.
- `tone`: `text`, `muted`, `accent`, `ok`, `warn`, `danger`.

## Check

Errors block rendering: schema violations, duplicate or unknown ids, not exactly one centre, parent loops, self links, non-http sources.
Warnings still render: labels over 40 characters, more than 9 children, nodes with neither summary nor body, more than 5 levels.

## The page

Click a label to open its panel, click a dot to fold its branch.
Drag to pan, scroll to zoom, `F` fits, arrows move, `Esc` closes, `T` toggles the theme.
The panel's copy button gives the reader a "go deeper" prompt to paste back, which is how the map grows.
