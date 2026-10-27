import { type SocketClaims, SocketHub } from "../../src/common/socket-hub.js";

/** Records what the API would send to Socket.io rooms, so tests can assert on events without sockets. */
export class RecordingSocketHub extends SocketHub {
  emitted: { room: string; event: string; payload: unknown }[] = [];
  disconnected: { room: string; kind?: SocketClaims["kind"] }[] = [];

  override emit(room: string, event: string, payload: unknown): void {
    this.emitted.push({ room, event, payload });
  }

  override async disconnect(room: string): Promise<void> {
    this.disconnected.push({ room });
  }

  override async disconnectKind(room: string, kind: SocketClaims["kind"]): Promise<void> {
    this.disconnected.push({ room, kind });
  }

  clear(): void {
    this.emitted = [];
    this.disconnected = [];
  }
}
