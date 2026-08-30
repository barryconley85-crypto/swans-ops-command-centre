import { describe, expect, it } from "vitest";
import { dateKeysBetween, shiftDateKey, shiftWeekAssignments } from "../client/src/lib/bulkOperations";

describe("bulk operations date helpers", () => {
  it("expands an inclusive range without crossing the requested dates", () => {
    expect(dateKeysBetween("2026-09-01", "2026-09-03")).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(dateKeysBetween("2026-09-03", "2026-09-01")).toEqual([]);
  });

  it("supports the three-week operating window", () => {
    expect(dateKeysBetween("2026-09-01", "2026-09-21")).toHaveLength(21);
    expect(dateKeysBetween("2026-09-01", "2026-09-22")).toHaveLength(22);
  });

  it("moves a week assignment exactly seven calendar days", () => {
    expect(shiftDateKey("2026-09-04", 7)).toBe("2026-09-11");
    expect(shiftWeekAssignments([{ workDate: "2026-09-04", duty: "early" }], 7)).toEqual([{ workDate: "2026-09-11", duty: "early" }]);
  });
});
