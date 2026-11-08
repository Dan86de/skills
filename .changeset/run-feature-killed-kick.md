---
"dan86de-skills": patch
---

`run-feature` no longer leaves a slice's session open when its kick dies: a kick stopped by SIGTERM, SIGINT or SIGHUP ends the session it was running and settles it `stopped`, and the next kick of the feature ends and settles any session a kick killed outright left behind before it starts its own.
