import { describe, expect, it } from "vitest";
import { buildTaskAssignmentNotification, standardShiftPatterns } from "../client/src/lib/collaboration";

describe("collaborative operations helpers", () => {
  it("provides the three agreed operational rota patterns", () => {
    expect(standardShiftPatterns.map(pattern => `${pattern.startTime}-${pattern.endTime}`)).toEqual(["06:00-15:00", "07:00-16:00", "09:00-18:00"]);
  });

  it("creates a recipient-specific unread task assignment notification", () => {
    expect(buildTaskAssignmentNotification({ id: 44, assignedEmail: "coral@swanstravel.com", title: "Call the client" }, 99, 1_000)).toMatchObject({ recipientEmail: "coral@swanstravel.com", taskId: 44, readAt: null, body: "Call the client" });
  });
});
