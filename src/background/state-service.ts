import { getEffectiveBlockingState, type EffectiveBlockingState } from "../shared/blocking-policy.js";
import type { ExtensionStorageState } from "../shared/schema.js";
import { finalizeExpiredTimers, getStableTimerNow } from "./timer-state-machine.js";
import { StorageRepository } from "./storage-repository.js";

export class StateService {
  constructor(private readonly storage = new StorageRepository()) {}

  async getCurrentState(now = Date.now()): Promise<ExtensionStorageState> {
    const storedState = await this.storage.load();
    const stableNow = getStableTimerNow(storedState, now);
    const finalized = finalizeExpiredTimers(storedState, stableNow);

    if (finalized.changed) {
      await this.storage.save(finalized.state);
    }

    return finalized.state;
  }

  async getEffectiveBlocking(now = Date.now()): Promise<EffectiveBlockingState> {
    const state = await this.getCurrentState(now);
    return getEffectiveBlockingState(state, getStableTimerNow(state, now));
  }

  async save(state: ExtensionStorageState): Promise<void> {
    await this.storage.save(state);
  }
}
