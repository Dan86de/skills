# Skill conventions

Everything here exists to keep one skill folder working identically across Claude Code, Codex, Cursor, OpenCode, and any other harness that reads Agent Skills.

## The shape of a skill

```
skills/<bucket>/<name>/
  SKILL.md
  agents/openai.yaml
  <SUPPORTING-FILE>.md   (optional, referenced from SKILL.md)
```

`SKILL.md` frontmatter:

```yaml
---
name: skill-name
description: One line. Model-facing or human-facing, see below.
---
```

`name` must equal the folder name, lowercase and kebab-case.
No harness-specific keys beyond the invocation flag below.

## Model-invoked vs user-invoked

This is the one axis that splits skills: who can reach it.

**Model-invoked** is the default.
Reachable by the model or the user.
Omit `disable-model-invocation` from the frontmatter and omit the `policy` block from `agents/openai.yaml`.
The `description` is **model-facing** and keeps rich trigger phrasing ("Use when the user wants..., mentions..., asks for...") so auto-invocation actually fires.
The test: could the model usefully reach for this on its own?

**User-invoked** is reachable only by the human typing its name.
Set `disable-model-invocation: true` in the frontmatter (Claude Code) and `policy.allow_implicit_invocation: false` in `agents/openai.yaml` (Codex).
The `description` is **human-facing**: a one-line summary someone reads while browsing slash commands.
Strip the trigger lists.

Keep the two declarations in sync.
A skill is user-invoked in both harnesses or in neither.

## agents/openai.yaml

Codex reads this file.
Everything in it is optional, including the file itself: without it a skill still loads, with no UI customisation, implicit invocation on, and no declared dependencies.

The house rule here is that every skill carries one anyway, so the Codex side is never the thing that got forgotten.

Three blocks, and they are not equally important.

**`interface`** is cosmetic.
It customises how the skill presents **in the ChatGPT desktop app** and nowhere else.
`short_description` is specced at 25 to 64 characters.

```yaml
interface:
  display_name: "Skill Name"
  short_description: "What it does, in a few words"
```

Also available: `icon_small`, `icon_large` (paths relative to the skill dir, keep assets in `assets/`), `brand_color`, and `default_prompt`.

**`policy`** is functional, and this is the one that matters.
`allow_implicit_invocation` defaults to `true`.
Set it to `false` on user-invoked skills, and Codex will not fire the skill off a user prompt, though explicit invocation still works.
This is the Codex half of `disable-model-invocation: true`.

```yaml
policy:
  allow_implicit_invocation: false
```

**`dependencies`** declares what the skill needs to work, so a missing MCP server surfaces as a dependency rather than as confusing failure mid-skill.
Only `type: "mcp"` is supported.

```yaml
dependencies:
  tools:
    - type: "mcp"
      value: "github"
      description: "GitHub MCP server"
      transport: "streamable_http"
      url: "https://api.githubcopilot.com/mcp/"
```

Reference: [OpenAI's skill docs](https://learn.chatgpt.com/docs/build-skills.md).

## Calling one skill from another

Write it as an explicit instruction to call the Skill tool by name:

> Call the Skill tool with "code-review".

Not a `../other-skill/FILE.md` cross-reference, and not a bare `/skill` mention left for the model to interpret.
Naming the tool is what gets it fired, and dropping the leading `/` keeps the instruction harness-neutral rather than assuming one harness's trigger syntax.

The Skill tool takes one skill per call.
A step needing two skills is two calls: say "Call the Skill tool twice, for X and for Y", not "call it with X and Y".

This convention only holds for **model-invoked** skills.
A user-invoked skill can never be reached this way.
When a step's precondition is a user-invoked skill, phrase it as an instruction for the human: "tell the user to run `/setup`", never as a Skill tool call.

Router prose that just names skills for a human to pick from is not invoking anything, so it can keep `/skill`-style names as plain labels.

## Shared material

Reference docs live inside the skill that owns them.
Other skills reach that material by calling the Skill tool with the owning skill, not by linking across folders.
A supporting file is only ever read by its own skill.

## Portability checklist

Before committing a skill, check that it does not:

- name a tool that only one harness has, unless the step is explicitly optional
- assume a specific model, context window, or subagent mechanism
- hardcode a path under `~/.claude/` or any other single harness's directory
- use `/slash-command` syntax in an operative instruction
