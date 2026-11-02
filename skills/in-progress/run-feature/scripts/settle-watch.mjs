// A finished background command or subagent reads as settled until the turn it wakes
// produces output; the longest wake seen across 39 real transcripts took 6.8 seconds.
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
