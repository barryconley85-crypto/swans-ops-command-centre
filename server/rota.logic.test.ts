import { describe, expect, it } from "vitest";
import { addDaysToDateKey } from "../client/src/lib/operations";

describe("rota week date boundaries", () => {
  it("keeps the full Monday-to-Sunday range during British Summer Time", () => {
    expect(addDaysToDateKey("2026-08-31", 7)).toBe("2026-09-07");
  });

  it("keeps the correct boundary when daylight saving time ends", () => {
    expect(addDaysToDateKey("2026-10-19", 7)).toBe("2026-10-26");
  });
});
