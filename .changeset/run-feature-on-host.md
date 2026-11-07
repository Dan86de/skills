---
"dan86de-skills": patch
---

`run-feature` refuses to start sessions unless kicked with `--on-host`, since every session would run on the host with full access, beside the shell's credentials, and logs the flag when given.
