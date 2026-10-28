import { vi } from "vitest";

// Screens rendered in tests must not open real sockets.
vi.mock("socket.io-client", () => ({
  io: () => ({ on: () => undefined, onAny: () => undefined, disconnect: () => undefined, connect: () => undefined }),
}));
