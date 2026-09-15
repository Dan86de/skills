# skills

Agent skills by [Daniel Noworyta](https://github.com/Dan86de).

One skill folder, every harness: Claude Code, Codex, Cursor, OpenCode, and anything else that reads Agent Skills.

## Install

Pick one route, not both.

### Claude Code

```bash
/plugin marketplace add Dan86de/skills
```

then:

```bash
/plugin install dan86de-skills@dan86de
```

A managed, read-only bundle.

### Codex, Cursor, OpenCode, and everything else

```bash
npx skills@latest add Dan86de/skills
```

Pick the skills you want and which agents to install them on.
These are editable files you own.

Update a single skill:

```bash
npx skills@latest update <name>
```

## Skills

### Engineering

_Nothing here yet._

### Productivity

_Nothing here yet._

## Developing

```bash
./scripts/link-skills.sh
```

Symlinks every skill into all five local harness skill directories, so an edit in this repo is live in every agent immediately.

Conventions for writing a skill live in [.agents/conventions.md](./.agents/conventions.md).
Repo rules live in [CLAUDE.md](./CLAUDE.md), which `AGENTS.md` symlinks to.

## License

MIT
