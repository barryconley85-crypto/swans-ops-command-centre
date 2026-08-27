import { describe, expect, it } from "vitest";
import { buildTaskAssignmentNotification, standardShiftPatterns } from "../client/src/lib/collaboration";
import { buildTaskCompletionAttribution, clearTaskCompletionAttribution } from "../client/src/lib/taskCompletion";

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
});
