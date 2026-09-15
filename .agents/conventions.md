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

Every skill carries one.
It holds Codex's picker metadata, and for user-invoked skills the policy flag that pairs with `disable-model-invocation`.

Model-invoked:

```yaml
interface:
  display_name: "Skill Name"
  short_description: "What it does, in a few words"
```

User-invoked adds:

```yaml
policy:
  allow_implicit_invocation: false
```

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
