import { describe, expect, it } from "vitest";
import { buildMyShiftSnapshot } from "../client/src/lib/myShift";

describe("my shift snapshot", () => {
  const state = { rota: [{ workDate: "2026-09-04", teamMemberId: 2, assignmentType: "early" }], tasks: [{ id: 1, workDate: "2026-09-04", assignedTeamMemberId: 2, status: "pending" }, { id: 2, workDate: "2026-09-04", assignedTeamMemberId: 3, status: "pending" }], handovers: [{ id: 3, status: "open", ownerTeamMemberId: 2, priority: "normal" }, { id: 4, status: "open", ownerTeamMemberId: 3, priority: "high" }], helpRequests: [{ id: 5, status: "acknowledged", requestedByTeamMemberId: 2 }, { id: 6, status: "open", requestedByTeamMemberId: 3, ownerTeamMemberId: 3 }] };
  it("shows the authenticated colleague their own duty and owned work, plus genuinely urgent shared context", () => {
    const result = buildMyShiftSnapshot(state, { id: 2 }, "2026-09-04");
    expect(result.assignment?.label).toBe("Early · 06:00–15:00");
    expect(result.openTasks).toHaveLength(1);
    expect(result.relevantHandovers.map((item: any) => item.id)).toEqual([3, 4]);
    expect(result.myHelpRequests.map((item: any) => item.id)).toEqual([5]);
  });
  it("does not invent a duty where no rota record exists", () => {
    expect(buildMyShiftSnapshot(state, { id: 9 }, "2026-09-04").assignment).toBeNull();
  });
});
