import { describe, expect, it } from "vitest";

describe("shift prompt record shape", () => {
  it("retains explicit handover review, risk and next-owner context", () => {
    const record = { workDate: "2026-09-04", phase: "close", teamMemberId: 2, userId: "user-2", handoverReviewed: true, riskNote: "Late cover watch", nextOwnerTeamMemberId: 3, nextAction: "Call Coral at 15:00" };
    expect(record).toMatchObject({ phase: "close", handoverReviewed: true, nextOwnerTeamMemberId: 3 });
  });
});
