import type { QueueCalledEvent, QueueSnapshot } from "@bq/shared";

// The public queue as a client sees it (spec 8.3). Every queue change raises a version; snapshots are complete,
// so a newer one replaces the store even across a gap, while a call event that skips a version asks for a resync.

export type QueueStore = {
  version: number;
  snapshot: QueueSnapshot | null;
  lastCall: QueueCalledEvent | null;
  needsResync: boolean;
};

export const initialQueueStore: QueueStore = { version: -1, snapshot: null, lastCall: null, needsResync: false };

/** For queue:state, queue:changed and GET /api/queue/state. Older snapshots are ignored. */
export function applySnapshot(s: QueueStore, snap: QueueSnapshot): QueueStore {
  if (s.snapshot && snap.version <= s.version) return s;
  return { ...s, version: snap.version, snapshot: snap, needsResync: false };
}

export function applyCalled(s: QueueStore, ev: QueueCalledEvent): QueueStore {
  return { ...s, lastCall: ev, needsResync: s.needsResync || ev.version > s.version + 1 };
}
