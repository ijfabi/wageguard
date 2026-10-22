import { Instant } from "@wageguard/domain";

/** Port for the current time, so that time-dependent behaviour is testable and deterministic. */
export interface Clock {
  now(): Instant;
}

export const CLOCK = Symbol("CLOCK");

export const systemClock: Clock = {
  now: () => Instant.ofEpochMs(Date.now()),
};
