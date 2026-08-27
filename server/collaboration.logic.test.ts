import { describe, expect, it } from "vitest";
import { buildTaskAssignmentNotification, hasExactRotaDuplicate, standardShiftPatterns } from "../client/src/lib/collaboration";
import { buildTaskCompletionAttribution, clearTaskCompletionAttribution } from "../client/src/lib/taskCompletion";
import { buildEndOfDayReport } from "../client/src/lib/endOfDayReport";

describe("collaborative operations helpers", () => {
  it("provides the three agreed operational rota patterns", () => {
    expect(standardShiftPatterns.map(pattern => `${pattern.startTime}-${pattern.endTime}`)).toEqual(["06:00-15:00", "07:00-16:00", "09:00-18:00"]);
  });

  it("creates a recipient-specific unread task assignment notification", () => {
    expect(buildTaskAssignmentNotification({ id: 44, assignedEmail: "coral@swanstravel.com", title: "Call the client" }, 99, 1_000)).toMatchObject({ recipientEmail: "coral@swanstravel.com", taskId: 44, readAt: null, body: "Call the client" });
  });

  it("stamps the actual authenticated completer and clears that evidence when work is reopened", () => {
    expect(buildTaskCompletionAttribution({ teamMemberId: 12, userId: "firebase-user-12", displayName: "Coral Hughes" }, 3_000)).toEqual({ completedAt: 3_000, completedByTeamMemberId: 12, completedByUserId: "firebase-user-12", completedByName: "Coral Hughes" });
    expect(clearTaskCompletionAttribution()).toEqual({ completedAt: null, completedByTeamMemberId: null, completedByUserId: null, completedByName: null });
  });

  it("blocks only an exact duplicate rota assignment while allowing a distinct duty on the same day", () => {
    const current = [{ id: 1, workDate: "2026-09-04", teamMemberId: 12, assignmentType: "early", startTime: "06:00", endTime: "15:00" }];
    expect(hasExactRotaDuplicate(current, { workDate: "2026-09-04", teamMemberId: 12, assignmentType: "early", startTime: "06:00", endTime: "15:00" })).toBe(true);
    expect(hasExactRotaDuplicate(current, { workDate: "2026-09-04", teamMemberId: 12, assignmentType: "late", startTime: "09:00", endTime: "18:00" })).toBe(false);
    expect(hasExactRotaDuplicate(current, { id: 1, workDate: "2026-09-04", teamMemberId: 12, assignmentType: "early", startTime: "06:00", endTime: "15:00" }, 1)).toBe(false);
  });

  it("separates completed and outstanding tasks in the end-of-day report", () => {
    const report = buildEndOfDayReport("Friday 4 September 2026", [{ title: "Ring round", status: "complete", completedByName: "Coral Hughes", completedAt: Date.UTC(2026, 8, 4, 16, 2) }, { title: "Zeelo sheet", status: "blocked", assignedName: "Barry Conley", blockedReason: "Awaiting operator update" }]);
    expect(report.subject).toContain("Friday 4 September 2026");
    expect(report.text).toContain("COMPLETED (1)");
    expect(report.text).toContain("completed by Coral Hughes");
    expect(report.text).toContain("OUTSTANDING (1)");
    expect(report.text).toContain("blocker: Awaiting operator update");
  });
});
