import type { ExtensionStorageState } from "./schema.js";
import { isTimerDeadlineActive } from "./timer.js";

export interface EffectiveBlockingState {
  readonly isBlocked: boolean;
  readonly manualBlocking: boolean;
  readonly focusTimerBlocking: boolean;
  readonly killTimerBlocking: boolean;
}

/** Derives blocking from durable state; it is never persisted as its own flag. */
export function getEffectiveBlockingState(
  state: ExtensionStorageState,
  now: number,
): EffectiveBlockingState {
  const focusTimerBlocking =
    state.timer.focus.status === "running" &&
    state.timer.focus.endAt !== null &&
    isTimerDeadlineActive(state.timer.focus.endAt, now);
  const killTimerBlocking =
    state.timer.kill.status === "running" &&
    state.timer.kill.endAt !== null &&
    isTimerDeadlineActive(state.timer.kill.endAt, now);

  return {
    isBlocked:
      state.settings.manualBlockingEnabled || focusTimerBlocking || killTimerBlocking,
    manualBlocking: state.settings.manualBlockingEnabled,
    focusTimerBlocking,
    killTimerBlocking,
  };
}
