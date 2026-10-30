import { describe, expect, it } from "vitest";
import { complaintMilestones, getEnglandWalesBankHolidays, isWorkingDay, isWorkingMinute, workingMinutesBetween } from "./complaint-sla-alerts.js";

const minute = value => Date.parse(value);
const holidays = ["2026-05-04"];

describe("complaint SLA clock", () => {
  it("counts only weekday minutes between 09:00 and 17:00 London time", () => {
    expect(workingMinutesBetween(minute("2026-01-02T16:30:00Z"), minute("2026-01-05T09:30:00Z"), holidays)).toBe(60);
  });

  it("excludes England and Wales bank holidays and handles daylight saving time", () => {
    expect(isWorkingMinute(minute("2026-05-04T10:00:00Z"), holidays)).toBe(false);
    expect(isWorkingMinute(minute("2026-06-01T08:00:00Z"), holidays)).toBe(true);
    expect(isWorkingMinute(minute("2026-06-01T16:00:00Z"), holidays)).toBe(false);
    expect(isWorkingDay(minute("2026-05-04T18:00:00Z"), holidays)).toBe(false);
  });

  it("alerts once within the SLA warning window and continues to alert after a missed deadline", () => {
    const complaint = {
      recordType: "complaint", stage: "investigating", receivedAt: minute("2026-01-05T09:00:00Z"),
      reference: "CMP-2026-0001", acknowledgementDueAt: minute("2026-01-05T17:00:00Z"),
      responseDueAt: minute("2026-01-09T17:00:00Z"), acknowledgedAt: null, clientResponse: "",
    };
    expect(complaintMilestones(complaint, minute("2026-01-05T15:00:00Z"), holidays).map(item => item.kind)).toContain("acknowledgement");
    expect(complaintMilestones({ ...complaint, acknowledgementEmailAlertedAt: 1 }, minute("2026-01-05T16:00:00Z"), holidays).map(item => item.kind)).not.toContain("acknowledgement");
    expect(complaintMilestones({ ...complaint, acknowledgementWarningSentAt: 1 }, minute("2026-01-05T16:00:00Z"), holidays).map(item => item.kind)).not.toContain("acknowledgement");
    expect(complaintMilestones(complaint, minute("2026-01-06T09:00:00Z"), holidays).map(item => item.kind)).toContain("acknowledgement");
    expect(complaintMilestones({ ...complaint, stage: "closed" }, minute("2026-01-05T16:00:00Z"), holidays)).toEqual([]);
  });

  it("loads the official England and Wales holiday calendar", async () => {
    const list = await getEnglandWalesBankHolidays(async () => ({ ok: true, json: async () => ({ "england-and-wales": { events: [{ date: "2026-12-25" }, { date: "invalid" }] } }) }));
    expect(list).toEqual(["2026-12-25"]);
  });
});
