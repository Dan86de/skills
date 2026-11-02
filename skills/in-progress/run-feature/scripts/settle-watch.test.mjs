import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SETTLE_GRACE_MS, settleWatch } from "./settle-watch.mjs";

describe("settleWatch", () => {
  it("does not settle a session the moment its background command finishes", () => {
    const settled = settleWatch(100);
    assert.equal(settled("working", 0), false);
    assert.equal(settled("done", 5), false);
    assert.equal(settled("done", 99 + 5), false);
  });

  it("settles a session that stays settled for the whole grace", () => {
    const settled = settleWatch(100);
    assert.equal(settled("done", 0), false);
    assert.equal(settled("done", 100), true);
  });

  it("starts the grace over when the session wakes into another turn", () => {
    const settled = settleWatch(100);
    assert.equal(settled("done", 0), false);
    assert.equal(settled("working", 50), false);
    assert.equal(settled("done", 120), false);
    assert.equal(settled("done", 219), false);
    assert.equal(settled("done", 220), true);
  });

  it("treats a session waiting on the user as not settled", () => {
    const settled = settleWatch(100);
    assert.equal(settled("done", 0), false);
    assert.equal(settled("blocked", 50), false);
    assert.equal(settled("idle", 60), false);
    assert.equal(settled("idle", 160), true);
  });

  it("holds every settled activity to the grace, and defaults to a grace far past a real wake", () => {
    for (const activity of ["done", "error", "idle"]) {
      const settled = settleWatch();
      assert.equal(settled(activity, 0), false, activity);
      assert.equal(settled(activity, SETTLE_GRACE_MS - 1), false, activity);
      assert.equal(settled(activity, SETTLE_GRACE_MS), true, activity);
    }
    assert.ok(SETTLE_GRACE_MS >= 30_000);
  });
});
