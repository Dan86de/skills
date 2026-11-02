// When a session's turn is really over. A background command or subagent
// finishing reads as settled until the turn it wakes first produces output, so
// a session counts as settled only once it has stayed that way for the grace.
// The longest wake seen across 39 real transcripts took 6.8 seconds.
export const SETTLE_GRACE_MS = 60_000;

export function settleWatch(graceMs = SETTLE_GRACE_MS) {
  let settledSince = null;
  return (activity, now) => {
    if (activity === "working" || activity === "blocked") {
      settledSince = null;
      return false;
    }
    settledSince ??= now;
    return now - settledSince >= graceMs;
  };
}
