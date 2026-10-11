import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultStorageState } from "../dist/shared/defaults.js";
import { getEffectiveBlockingState } from "../dist/shared/blocking-policy.js";
import {
  cancelFocusTimer,
  finalizeExpiredTimers,
  pauseFocusTimer,
  resumeFocusTimer,
  startFocusTimer,
  startKillTimer,
} from "../dist/background/timer-state-machine.js";

test("normal timer pause and resume preserve remaining time", () => {
  const started = startFocusTimer(createDefaultStorageState(), 10, 0);
  const paused = pauseFocusTimer(started, 120_000);

  assert.equal(paused.timer.focus.status, "paused");
  assert.equal(paused.timer.focus.endAt, null);
  assert.equal(paused.timer.focus.remainingMilliseconds, 480_000);
  assert.equal(getEffectiveBlockingState(paused, 120_000).isBlocked, false);

  const resumed = resumeFocusTimer(paused, 180_000);
  assert.equal(resumed.timer.focus.status, "running");
  assert.equal(resumed.timer.focus.endAt, 660_000);
  assert.equal(getEffectiveBlockingState(resumed, 181_000).isBlocked, true);
});

test("normal timer cancellation clears only the focus timer state", () => {
  const withKill = startKillTimer(createDefaultStorageState(), 30, 0);
  const withFocus = startFocusTimer(withKill, 5, 0);
  const cancelled = cancelFocusTimer(withFocus, 30_000);

  assert.equal(cancelled.timer.focus.status, "cancelled");
  assert.equal(cancelled.timer.kill.status, "running");
  assert.equal(getEffectiveBlockingState(cancelled, 31_000).killTimerBlocking, true);
});

test("expired timers finalize cleanly while preserving other active blockers", () => {
  const state = startKillTimer(startFocusTimer(createDefaultStorageState(), 1, 0), 5, 0);
  const finalized = finalizeExpiredTimers(state, 61_000);

  assert.equal(finalized.changed, true);
  assert.equal(finalized.state.timer.focus.status, "completed");
  assert.equal(finalized.state.timer.kill.status, "running");
  assert.equal(getEffectiveBlockingState(finalized.state, 61_000).isBlocked, true);
});
