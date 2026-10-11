export const MIN_TIMER_MINUTES = 1;
export const MAX_TIMER_MINUTES = 480;
export const DEFAULT_FOCUS_DURATION_MINUTES = 25;
export const DEFAULT_KILL_DURATION_MINUTES = 60;

export type TimerKind = "focus" | "kill";
export type FocusTimerStatus = "idle" | "running" | "paused" | "completed" | "cancelled";
export type KillTimerStatus = "idle" | "running" | "completed";

/** Returns true only for whole-minute durations supported by the product. */
export function isValidTimerDurationMinutes(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_TIMER_MINUTES &&
    value <= MAX_TIMER_MINUTES
  );
}

/** Converts a valid duration into a durable millisecond value. */
export function minutesToMilliseconds(minutes: number): number {
  if (!isValidTimerDurationMinutes(minutes)) {
    throw new RangeError(
      `Timer duration must be a whole number from ${MIN_TIMER_MINUTES} to ${MAX_TIMER_MINUTES} minutes.`,
    );
  }

  return minutes * 60_000;
}

/** Formats a non-negative remaining duration as m:ss or h:mm:ss. */
export function formatRemainingDuration(remainingMilliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMilliseconds / 1_000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const paddedSeconds = seconds.toString().padStart(2, "0");

  if (hours === 0) {
    return `${totalMinutes}:${paddedSeconds}`;
  }

  return `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`;
}

/** Calculates remaining time from an absolute deadline without relying on worker memory. */
export function getRemainingMilliseconds(endAt: number, now: number): number {
  return Math.max(0, endAt - now);
}

/**
 * A persisted end timestamp is sufficient to restore a kill timer after a
 * browser or service-worker restart. An alarm is only a wake-up signal; time
 * elapsed is determined from this value.
 */
export function isTimerDeadlineActive(endAt: number, now: number): boolean {
  return Number.isFinite(endAt) && endAt > now;
}

/**
 * The normal focus timer is intentionally user-cancellable while it is active
 * or paused. Kill timers are never cancellable through extension messages.
 */
export function canCancelTimer(
  kind: TimerKind,
  status: FocusTimerStatus | KillTimerStatus,
): boolean {
  return kind === "focus" && (status === "running" || status === "paused");
}
