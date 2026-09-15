# The canonical install block

One install story, one wording.
`README.md` and every changeset must say **this** and nothing else.
Change it here first, then propagate.

## Claude Code: the plugin

<canonical-block name="claude-code">

```bash
/plugin marketplace add Dan86de/skills
```

then:

```bash
/plugin install dan86de-skills@dan86de
```

A managed, read-only bundle.

</canonical-block>

## Codex, Cursor, OpenCode, and everything else: skills.sh

The plugin is Claude Code only.
Everywhere else, [skills.sh](https://skills.sh) copies editable skill files into the project or your home directory.

<canonical-block name="skills-sh-whole-set">

```bash
npx skills@latest add Dan86de/skills
```

Pick the skills you want and which agents to install them on.

</canonical-block>

Single skill:

<canonical-block name="skills-sh-one-skill">

```bash
npx skills@latest add Dan86de/skills --skill=<name>
```

```bash
npx skills@latest update <name>
```

</canonical-block>

## The two routes are exclusive

The plugin is a managed bundle you subscribe to.
skills.sh writes files you own and edit.
Installing both leaves the user with every skill twice, so always say "pick one".
