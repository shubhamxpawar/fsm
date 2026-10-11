import type { KillTimerStatus } from "./timer.js";

export type ControlLockReason = "kill-timer-running" | null;

/**
 * A running kill timer locks all extension actions that could make selected
 * sites available. This policy is reused by UI rendering and worker-side
 * message validation; hiding a button alone is never an enforcement boundary.
 */
export function getBlockingControlLock(
  killTimerStatus: KillTimerStatus,
): ControlLockReason {
  return killTimerStatus === "running" ? "kill-timer-running" : null;
}

export function canChangeManualBlocking(killTimerStatus: KillTimerStatus): boolean {
  return getBlockingControlLock(killTimerStatus) === null;
}

export function canPauseOrCancelKillTimer(): false {
  return false;
}
