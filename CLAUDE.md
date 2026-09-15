# Repo conventions

This repo holds agent skills that install into every harness Daniel runs: Claude Code, Codex, Cursor, OpenCode, and anything reading `~/.agents/skills`.
Harness neutrality is the constraint that shapes everything below.

## Layout

Skills live in bucket folders under `skills/`:

- `engineering/`: daily code work
- `productivity/`: daily non-code workflow tools
- `in-progress/`: beta, public on purpose, feedback wanted, not shipped in the plugin

Those three are the whole set.
Do not add a fourth bucket without deciding what it means first.

A skill is a folder containing `SKILL.md` plus any supporting files it references.
The folder name is the skill name, and it must match the `name` in the frontmatter.

`engineering/` and `productivity/` are the **promoted** buckets.
Every skill in them must have an entry in the top-level `README.md` and in `.claude-plugin/plugin.json`'s `skills` array, because the Claude Code plugin ships exactly the promoted set.
Skills in `in-progress/` must appear in neither.
They still get linked locally by `scripts/link-skills.sh`, because that is where their feedback loop runs.

Promoting a skill is one move: `git mv` it into `engineering/` or `productivity/`, then add it to both lists.

Each bucket has a `README.md` listing every skill in it with a one-line description, with the skill name linked to its `SKILL.md`.
The promoted buckets' `README.md`s and the top-level `README.md` group entries into **User-invoked** and **Model-invoked**; `in-progress/` uses a flat list.

## Writing a skill

Conventions for frontmatter, invocation, and cross-skill calls live in [.agents/conventions.md](./.agents/conventions.md).
Read it before adding or editing a `SKILL.md`.

The short version: every skill carries an `agents/openai.yaml` beside its `SKILL.md`, and a skill is either user-invoked in both harnesses or in neither.

## Installing locally

Run `scripts/link-skills.sh` to symlink every skill into all five local harness skill directories.
Each entry is a symlink into this working copy, so an edit is live immediately and a `git pull` keeps every agent current.
Re-run the script after adding, renaming, or removing a skill.

`scripts/list-skills.sh` prints every `SKILL.md` path in the repo.

## Publishing

Install commands are copied verbatim from [.agents/install-block.md](./.agents/install-block.md).
Change them there first, then propagate.

`.claude-plugin/plugin.json` is the plugin manifest and `.claude-plugin/marketplace.json` makes this repo its own single-plugin marketplace.
Run `claude plugin validate . --strict` after touching either.

Versioning is changesets.
Add a changeset for any user-visible change, and never hand-edit `CHANGELOG.md` or the `version` field in `plugin.json`.

## Prose

No em-dashes anywhere in this repo's prose.
Where a sentence reaches for one, rewrite it with a comma, colon, period, parentheses, or a conjunction, whichever the sentence actually wants.
Never do a blind character substitution.

Write one sentence per line in Markdown files.
It keeps diffs readable.
