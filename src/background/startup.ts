import { backgroundController } from "./background-controller.js";

export type StartupReason = "installed" | "updated" | "startup" | "permissions-changed";

/**
 * Owns lifecycle ordering. Storage repair and timer expiry happen before the
 * blocking rules are reconciled before the badge is updated. Alarm restoration
 * joins this flow in the timer milestone.
 */
export async function initializeExtension(reason: StartupReason): Promise<void> {
  await backgroundController.initialize();
  void reason;
}
