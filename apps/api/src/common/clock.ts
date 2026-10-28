// The server clock is the only clock (spec 6.13). Tests replace it to move through time.
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol("CLOCK");

export const systemClock: Clock = { now: () => new Date() };
