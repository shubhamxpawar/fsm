import { getEffectiveBlockingState } from "../shared/blocking-policy.js";
import type { ExtensionStorageState, PersistedTimerState } from "../shared/schema.js";
import {
  canCancelTimer,
  getRemainingMilliseconds,
  isTimerDeadlineActive,
  minutesToMilliseconds,
} from "../shared/timer.js";

export function startFocusTimer(
  state: ExtensionStorageState,
  durationMinutes: number,
  now: number,
): ExtensionStorageState {
  return withTimer(state, now, {
    ...state.timer,
    focus: {
      status: "running",
      endAt: now + minutesToMilliseconds(durationMinutes),
      remainingMilliseconds: null,
    },
  });
}

export function pauseFocusTimer(
  state: ExtensionStorageState,
  now: number,
): ExtensionStorageState {
  const focus = state.timer.focus;
  if (focus.status !== "running" || focus.endAt === null) {
    return state;
  }

  const remainingMilliseconds = getRemainingMilliseconds(focus.endAt, now);
  if (remainingMilliseconds === 0) {
    return finalizeExpiredTimers(state, now).state;
  }

  return withTimer(state, now, {
    ...state.timer,
    focus: {
      status: "paused",
      endAt: null,
      remainingMilliseconds,
    },
  });
}

export function resumeFocusTimer(
  state: ExtensionStorageState,
  now: number,
): ExtensionStorageState {
  const focus = state.timer.focus;
  if (
    focus.status !== "paused" ||
    focus.remainingMilliseconds === null ||
    focus.remainingMilliseconds <= 0
  ) {
    return state;
  }

  return withTimer(state, now, {
    ...state.timer,
    focus: {
      status: "running",
      endAt: now + focus.remainingMilliseconds,
      remainingMilliseconds: null,
    },
  });
}

export function cancelFocusTimer(
  state: ExtensionStorageState,
  now: number,
): ExtensionStorageState {
  if (!canCancelTimer("focus", state.timer.focus.status)) {
    return state;
  }

  return withTimer(state, now, {
    ...state.timer,
    focus: {
      status: "cancelled",
      endAt: null,
      remainingMilliseconds: null,
    },
  });
}

export function startKillTimer(
  state: ExtensionStorageState,
  durationMinutes: number,
  now: number,
): ExtensionStorageState {
  if (state.timer.kill.status === "running") {
    return state;
  }

  return withTimer(state, now, {
    ...state.timer,
    kill: {
      status: "running",
      endAt: now + minutesToMilliseconds(durationMinutes),
    },
  });
}

export function finalizeExpiredTimers(
  state: ExtensionStorageState,
  now: number,
): { readonly state: ExtensionStorageState; readonly changed: boolean } {
  const focusExpired =
    state.timer.focus.status === "running" &&
    state.timer.focus.endAt !== null &&
    !isTimerDeadlineActive(state.timer.focus.endAt, now);
  const killExpired =
    state.timer.kill.status === "running" &&
    state.timer.kill.endAt !== null &&
    !isTimerDeadlineActive(state.timer.kill.endAt, now);

  if (!focusExpired && !killExpired) {
    return { state, changed: false };
  }

  return {
    changed: true,
    state: withTimer(state, now, {
      ...state.timer,
      focus: focusExpired
        ? { status: "completed", endAt: null, remainingMilliseconds: null }
        : state.timer.focus,
      kill: killExpired ? { status: "completed", endAt: null } : state.timer.kill,
    }),
  };
}

export function isBlockingEffective(state: ExtensionStorageState, now: number): boolean {
  return getEffectiveBlockingState(state, now).isBlocked;
}

export function getStableTimerNow(state: ExtensionStorageState, now: number): number {
  return state.timer.lastTransitionAt === null ? now : Math.max(now, state.timer.lastTransitionAt);
}

function withTimer(
  state: ExtensionStorageState,
  now: number,
  timer: PersistedTimerState,
): ExtensionStorageState {
  return {
    ...state,
    timer: {
      ...timer,
      lastTransitionAt: now,
    },
  };
}
