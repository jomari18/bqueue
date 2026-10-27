import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "./clock.js";

/**
 * Connected sockets per barangay. The simulator runs only while someone watches (spec 8.4), so it listens here
 * instead of depending on the gateway.
 */
@Injectable()
export class PresenceTracker {
  private readonly counts = new Map<string, number>();
  private readonly left = new Map<string, Date>();
  private readonly listeners = new Set<(barangayId: string) => void>();

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  connected(barangayId: string): void {
    this.counts.set(barangayId, this.count(barangayId) + 1);
    this.notify(barangayId);
  }

  disconnected(barangayId: string): void {
    const n = Math.max(0, this.count(barangayId) - 1);
    if (n === 0) this.counts.delete(barangayId);
    else this.counts.set(barangayId, n);
    this.left.set(barangayId, this.clock.now());
    this.notify(barangayId);
  }

  count(barangayId: string): number {
    return this.counts.get(barangayId) ?? 0;
  }

  lastLeftAt(barangayId: string): Date | null {
    return this.left.get(barangayId) ?? null;
  }

  onChange(listener: (barangayId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(barangayId: string): void {
    for (const l of this.listeners) l(barangayId);
  }
}
