# Map format

One JSON file per map.
`scripts/map.mjs` checks it, prints it as an outline, and renders it to a single self-contained HTML page.

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
      "body": "**Stock:** a thing you can count at one moment.\n\n- A stock changes only through its flows.\n- **Bathtub ceiling:** ...",
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
| `title` | yes | Shown top left and as the page title. |
| `lens` | no | Who the map is for and why, shown under the title. |
| `kicker` | no | Small mono label above the title. Default "Map". |
| `chrome` | no | `false` hides the handle in the bottom right corner. |
| `nodes` | yes | Flat array. The tree comes from `parent`. |
| `states` | no | Custom node states, see below. Merged over the defaults. |
| `askLabel` | no | Heading for the `ask` block. Default "Question to ask". |
| `promptTemplate` | no | Text the panel's copy button puts on the clipboard. `{label}`, `{id}` and `{title}` are filled in. |
| `promptLabel` | no | Text on that button. |
| `prompt` | no | `false` hides the copy button. |

## Node

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Lowercase kebab-case, unique, stable. Never rename an id once the map has been rendered. |
| `label` | yes | Under 40 characters. What the reader scans. |
| `parent` | all but one | The id of the parent. Exactly one node has no parent: the centre. |
| `state` | no | A key of `states`. No state draws a hollow dot. |
| `summary` | recommended | One sentence, shown first in the panel. |
| `body` | no | A few short lines. Supports `**bold**`, `` `code` ``, `[text](https://...)`, `- ` bullets and blank-line paragraphs. Nothing else. |
| `ask` | no | One question the reader can put to their own situation. |
| `links` | no | Ids of related nodes anywhere in the tree. Drawn as dashed lines, listed both ways under Related. |
| `sources` | no | `[{ "title", "url" }]`, http(s) only. |

Order matters: children render in array order, top to bottom.

## States

Defaults:

| State | Mark | Meaning |
| --- | --- | --- |
| `open` | hollow dot | Not explored yet. Same as no state. |
| `suggested` | filled orange dot | Worth reading first. |

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
- `tone`: `text`, `muted`, `accent`, `ok`, `warn`, `danger`. Colours follow the viewer's light or dark mode.

The legend shows only the states the map uses.

## What `check` enforces

Errors (exit 1, nothing rendered): missing title or nodes, bad or duplicate ids, missing labels, not exactly one centre, unknown parents, parent loops, unknown states, links to unknown ids or to self, non-http sources.

Warnings (still renders): labels over 40 characters, more than 9 children under one node, nodes with neither summary nor body, more than 5 levels deep.

## The page

- Click a label to open its panel. Click a dot to fold or unfold its branch. Folds are remembered per browser.
- Drag to pan, scroll or pinch to zoom, `F` to fit, arrow keys to move between nodes, `Esc` to close.
- The page follows the viewer's light or dark setting until they press the theme button or `T`, then remembers their choice.
- Styling follows Daniel's brand: charcoal and white, one orange accent, Geomanist for labels, Silka Mono for small caps, Atkinson Hyperlegible for body text. Geomanist and Silka Mono load from the viewer's machine when installed, with Outfit and DM Mono from Google Fonts as fallbacks.
- The panel's copy button hands the reader a prompt to paste back to the agent, which is how the map grows.
