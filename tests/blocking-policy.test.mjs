import assert from "node:assert/strict";
import test from "node:test";
import { getEffectiveBlockingState } from "../dist/shared/blocking-policy.js";
import { createDefaultStorageState } from "../dist/shared/defaults.js";
import { startKillTimer } from "../dist/background/timer-state-machine.js";

test("manual on/off switch blocks immediately without a timer", () => {
  const state = createDefaultStorageState();
  assert.equal(getEffectiveBlockingState(state, 0).isBlocked, false);

  const enabled = {
    ...state,
    settings: { ...state.settings, manualBlockingEnabled: true },
  };
  assert.equal(getEffectiveBlockingState(enabled, 0).isBlocked, true);
});

test("manual off cannot bypass a running kill timer", () => {
  const state = startKillTimer(createDefaultStorageState(), 1, 0);
  assert.equal(getEffectiveBlockingState(state, 1).isBlocked, true);
});
