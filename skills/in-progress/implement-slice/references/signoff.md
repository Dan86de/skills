# Sign-off

`--signoff S4` records that the user has checked a pending slice.

Refuse when S4 is not pending.
Show its `Awaiting sign-off:` list and its PR section, and ask the user to confirm each item.

When they confirm all of them, make an empty commit with subject `Sign off S4: <title>`, a body listing each item as confirmed, and the trailer `Slice: S4`.
Push it, then render S4's PR section again per [pr-section.md](pr-section.md).
If every slice is now done, continue at step 9 of the skill.

When they do not, commit nothing.
They fix it by running the skill on S4 again, which rebuilds it through the gate.
