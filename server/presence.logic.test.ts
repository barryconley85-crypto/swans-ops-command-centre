import { describe, expect, it } from "vitest";
import { activePresence, isActiveNow, PRESENCE_WINDOW_MS } from "../client/src/lib/presence";

describe("transparent active-now presence", () => {
  it("shows recent workspace activity but never treats stale records as active", () => {
    const now = 10_000_000; expect(isActiveNow({ lastActiveAt: now - 30_000 }, now)).toBe(true); expect(isActiveNow({ lastActiveAt: now - PRESENCE_WINDOW_MS }, now)).toBe(false); expect(activePresence([{ id: 1, lastActiveAt: now - 1_000 }, { id: 2, lastActiveAt: now - 300_000 }], now).map(item => item.id)).toEqual([1]);
  });
});
