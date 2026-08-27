import { describe, expect, it } from "vitest";
import { calculateMemberPerformance, countCoverGaps } from "./operations.logic";

describe("calculateMemberPerformance", () => {
  it("calculates completion, timeliness, blocked work and fair-duty inputs independently", () => {
    const result = calculateMemberPerformance(7, [
      { assignedTeamMemberId: 7, status: "complete", dueAt: 1_000, completedAt: 900, blockedReason: null },
      { assignedTeamMemberId: 7, status: "complete", dueAt: 1_000, completedAt: 1_250, blockedReason: null },
      { assignedTeamMemberId: 7, status: "blocked", dueAt: null, completedAt: null, blockedReason: "Awaiting driver confirmation" },
      { assignedTeamMemberId: 7, status: "blocked", dueAt: null, completedAt: null, blockedReason: "Awaiting driver confirmation" },
      { assignedTeamMemberId: 8, status: "complete", dueAt: null, completedAt: 500, blockedReason: null },
    ], [
      { teamMemberId: 7, assignmentType: "early" },
      { teamMemberId: 7, assignmentType: "on_call" },
      { teamMemberId: 8, assignmentType: "core" },
    ]);

    expect(result).toMatchObject({
      assignedCount: 4,
      completeCount: 2,
      completionRate: 50,
      timelyCount: 1,
      timelinessRate: 50,
      blockedCount: 2,
      recurringBlocker: "Awaiting driver confirmation",
      shiftCount: 1,
      onCallCount: 1,
    });
  });
});

describe("countCoverGaps", () => {
  it("separates missing on-call cover from missing operational shift cover", () => {
    expect(countCoverGaps(["2026-08-24", "2026-08-25"], [
      { workDate: "2026-08-24", assignmentType: "on_call" },
      { workDate: "2026-08-24", assignmentType: "core" },
      { workDate: "2026-08-25", assignmentType: "early" },
    ])).toEqual({ onCallGaps: ["2026-08-25"], shiftGaps: [] });
  });
});
