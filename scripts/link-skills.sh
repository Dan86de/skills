#!/usr/bin/env bash
set -euo pipefail

# Dev-only script for maintainers of this repo. It is not the supported
# installer: end users install with `npx skills@latest add Dan86de/skills`
# or the Claude Code plugin.
#
# Symlinks every skill in this repo into each agent harness's global skill
# directory. Because each entry is a symlink into the working copy, a `git
# pull` (or any edit) is live in every agent immediately. Re-run after adding,
# renaming, or removing a skill: stale links into this repo are pruned.

REPO="$(cd "$(dirname "$0")/.." && pwd)"

DESTS=(
  "$HOME/.claude/skills"           # Claude Code
  "$HOME/.codex/skills"            # Codex
  "$HOME/.cursor/skills"           # Cursor
  "$HOME/.agents/skills"           # Cline, Zed, Warp, Kimi, generic
  "$HOME/.config/opencode/skills"  # OpenCode
)

names=()
srcs=()
while IFS= read -r -d '' skill_md; do
  src="$(dirname "$skill_md")"
  names+=("$(basename "$src")")
  srcs+=("$src")
done < <(find "$REPO/skills" -name SKILL.md -not -path '*/node_modules/*' -print0)

if [ "${#names[@]}" -eq 0 ]; then
  echo "no skills found under $REPO/skills, nothing to link" >&2
fi

for DEST in "${DESTS[@]}"; do
  # A $DEST that is itself a symlink into this repo would make us write the
  # per-skill links back into the repo's own skills/ tree. Bail out instead.
  if [ -L "$DEST" ]; then
    resolved="$(cd "$(dirname "$DEST")" && cd "$(readlink "$DEST")" && pwd)"
    case "$resolved" in
      "$REPO"|"$REPO"/*)
        echo "error: $DEST is a symlink into this repo ($resolved)." >&2
        echo "Remove it (rm \"$DEST\") and re-run; it will be recreated as a real dir." >&2
        exit 1
        ;;
    esac
  fi

  mkdir -p "$DEST"

  # Prune links this repo owns that no longer match a skill, so a rename does
  # not leave the old name installed forever.
  for existing in "$DEST"/*; do
    [ -L "$existing" ] || continue
    target="$(readlink "$existing")"
    case "$target" in
      "$REPO"/*) ;;
      *) continue ;;
    esac
    still_ours=false
    for src in "${srcs[@]:-}"; do
      [ "$target" = "$src" ] && still_ours=true && break
    done
    if [ "$still_ours" = false ]; then
      rm -f "$existing"
      echo "pruned $(basename "$existing") ($DEST)"
    fi
  done

  if [ "${#names[@]}" -gt 0 ]; then
    for i in "${!names[@]}"; do
      name="${names[$i]}"
      src="${srcs[$i]}"
      target="$DEST/$name"

      # A real directory here is an older copy-install of the same skill.
      if [ -e "$target" ] && [ ! -L "$target" ]; then
        rm -rf "$target"
      fi

      ln -sfn "$src" "$target"
      echo "linked $name -> $src ($DEST)"
    done
  fi
done
