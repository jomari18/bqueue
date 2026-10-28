import { Injectable } from "@nestjs/common";

/** Signals that a person (not the simulator) changed something in a barangay. The simulator wakes on it. */
@Injectable()
export class ActivityBus {
  private readonly listeners = new Set<(barangayId: string) => void>();

  humanAction(barangayId: string): void {
    for (const l of this.listeners) l(barangayId);
  }

  onHumanAction(listener: (barangayId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
