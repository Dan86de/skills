# Assessor brief

Pass everything below the line to the assessor subagent, with every `<placeholder>` filled in and every path absolute.

---

Decide how dangerous one branch is to merge, so a reviewer knows where to spend attention.
You did not write it; the author already believes it is safe, and your job is to check.

- **Repo**: `<repo-path>`.
  Run every command there.
- **Change**: `git diff <base>..HEAD` and `git log --format='%h %s%n%n%b' <base>..HEAD`.
- **Intent**: `<spec-path, or "none">`: what the change was meant to do and leave alone.
- **One-way rules**: `<baseline-path>`, plus the `## One-way doors` section of `<files-with-that-section, or "none">`.
- **Findings to recheck**, each with its source commit:

```text
<open-findings, or "none">
```

Read any code you need.
Every `file:line` is repo-relative, at `HEAD`.
Stay read-only: no skills, no subagents, no edits.

**Door.** One-way when undoing costs more than reverting the commit, because revert removes code, not what it already did.
Check every rule against the diff; a rule matches when the diff does what it describes.
Also name any one-way effect no rule covers.
Anything matched makes it one-way.

**Blast radius.** Localized when a mistake shows up only in the feature the change is for; wide when it can reach shared code, a shared stylesheet or layout, config or build files, a public surface, or a widely used type.

**Read first.** Up to three lines a reviewer should open first, most dangerous first.

**Findings.** Open each at `HEAD`; keep those that still hold, with updated lines.

Return only this block, at most 300 words, an empty list reading `- none`:

```text
Door: <one-way | two-way> - <one line: why>
Rules checked: <rule names, comma-separated>
Matched:
- <rule, or "unnamed: <effect>"> - <file:line> - <what the diff does>
Blast radius: <localized | wide> - <one line: what a mistake would reach>
Read first:
- <file:line> - <why>
Still open:
- [<severity>] <finding, as given, with its line at HEAD>
Resolved: <count>
```
