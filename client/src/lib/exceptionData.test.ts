import { describe, expect, it } from "vitest";
import { activeExceptionTasks, rotaForExceptionDate } from "./exceptionData";

describe("Live Operations data filters", () => {
  it("keeps current and unfinished carry-over tasks, while excluding completed, future, and other users' personal tasks", () => {
    const rows = [
      { id: "today", workDate: "2026-11-03", status: "pending" },
      { id: "carry-over", workDate: "2026-11-02", status: "blocked" },
      { id: "completed", workDate: "2026-11-03", status: "complete" },
      { id: "future", workDate: "2026-11-04", status: "pending" },
      { id: "private-other", workDate: "2026-11-03", status: "pending", isPersonal: true, personalOwnerUserId: "other", createdByUserId: "other" },
      { id: "private-owner", workDate: "2026-11-03", status: "pending", isPersonal: true, personalOwnerUserId: "viewer" },
    ];

    expect(activeExceptionTasks(rows, "2026-11-03", "viewer", false).map(row => row.id))
      .toEqual(["today", "carry-over", "private-owner"]);
    expect(activeExceptionTasks(rows, "2026-11-03", "lead", true).map(row => row.id))
      .toEqual(["today", "carry-over", "private-other", "private-owner"]);
    expect(activeExceptionTasks(rows, "2026-11-03", null, false).map(row => row.id))
      .toEqual(["today", "carry-over"]);
  });

  it("keeps rota assignments for the selected date only", () => {
    const rows = [
      { id: "today", workDate: "2026-11-03" },
      { id: "yesterday", workDate: "2026-11-02" },
    ];

    expect(rotaForExceptionDate(rows, "2026-11-03").map(row => row.id)).toEqual(["today"]);
  });
});
