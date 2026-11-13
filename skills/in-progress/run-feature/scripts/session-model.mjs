// The model every run-feature session runs on, whether agents-hq launches it or
// the claude -p fallback does. Pinned so a run costs and behaves the same
// whatever the harness's own default is; subagents inherit it.
export const SESSION_MODEL = "claude-opus-5-5";
