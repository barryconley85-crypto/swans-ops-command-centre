import { describe, expect, it } from "vitest";
import { daysUntilDate, evaluateCompliance, reconcileAlertState } from "./compliance-alert-engine.js";

const now = new Date("2026-11-07T08:00:00.000Z");

describe("compliance early warning evaluation", () => {
  it("flags missing records and missing mandatory dates for active drivers", () => {
    const result = evaluateCompliance([], [{ _docId: "d1", name: "No Record" }], now);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe("critical");
    expect(result.issues[0].category).toBe("record-completeness");
  });

  it("flags expired, 7, 14 and 30 day document windows with increasing severity", () => {
    const driver = { _docId: "d1", name: "Test Driver" };
    const record = {
      driverId: "d1", driverName: "Test Driver",
      licenceValidTo: "2026-11-06",
      consentExpiry: "2026-11-14",
      cpcExpiry: "2026-11-21",
      tachoCardExpiry: "2026-11-21",
      trainingExpiry: "2026-12-07",
    };
    const issues = evaluateCompliance([record], [driver], now).issues;
    const byField = Object.fromEntries(issues.filter(issue => issue.field).map(issue => [issue.field, issue]));
    expect(byField.licenceValidTo.severity).toBe("critical");
    expect(byField.consentExpiry.severity).toBe("critical");
    expect(byField.cpcExpiry.severity).toBe("high");
    expect(byField.tachoCardExpiry.severity).toBe("high");
    expect(byField.trainingExpiry.severity).toBe("warning");
  });

  it("does not treat an evidenced, current Section 88 record as an expired licence", () => {
    const record = {
      driverId: "d1", driverName: "Section 88 Driver", licenceValidTo: "2026-11-06",
      section88Confirmed: true, section88EvidenceReceived: true,
      section88DvlaReceivedDate: "2026-10-20", section88Ended: false,
    };
    const issues = evaluateCompliance([record], [{ _docId: "d1", name: "Section 88 Driver" }], now).issues;
    expect(issues.some(issue => issue.field === "licenceValidTo")).toBe(false);
  });

  it("flags points thresholds and endorsement expiry separately", () => {
    const record = {
      driverId: "d1", driverName: "Points Driver",
      endorsements: [
        { offenceCode: "SP30", points: 6, offenceDate: "2026-01-01", expiryDate: "2026-11-14" },
        { offenceCode: "CU80", points: 3, offenceDate: "2026-02-01", expiryDate: "2027-02-01" },
      ],
    };
    const issues = evaluateCompliance([record], [{ _docId: "d1", name: "Points Driver" }], now).issues;
    expect(issues.some(issue => issue.category === "licence-endorsements" && issue.threshold === 9)).toBe(true);
    expect(issues.some(issue => issue.key.includes("points-expiry"))).toBe(true);
  });

  it("ignores inactive drivers and rejects impossible calendar dates", () => {
    expect(daysUntilDate("2026-02-30", "2026-11-07")).toBe(null);
    const result = evaluateCompliance([], [{ _docId: "d1", name: "Inactive", active: false }], now);
    expect(result.issues).toHaveLength(0);
  });
});

describe("compliance alert state reconciliation", () => {
  it("notifies only on newly opened or escalated issues and preserves acknowledgement/owner", () => {
    const first = { key: "d1:cpc", severity: "warning", state: "due", title: "CPC due" };
    const opened = reconcileAlertState([first], {}, now);
    expect(opened.opened).toHaveLength(1);
    expect(opened.shouldNotify).toBe(true);

    const acknowledged = {
      ...opened.next["d1:cpc"],
      acknowledgedAt: "2026-11-07T09:00:00.000Z",
      acknowledgedBy: "Baz",
      owner: "Compliance",
    };
    const unchanged = reconcileAlertState([first], { "d1:cpc": acknowledged }, new Date("2026-11-07T10:00:00.000Z"));
    expect(unchanged.shouldNotify).toBe(false);
    expect(unchanged.next["d1:cpc"].owner).toBe("Compliance");
    expect(unchanged.next["d1:cpc"].acknowledgedBy).toBe("Baz");

    const escalated = reconcileAlertState([{ ...first, severity: "critical" }], unchanged.next, new Date("2026-11-08T08:00:00.000Z"));
    expect(escalated.escalated).toHaveLength(1);
    expect(escalated.shouldNotify).toBe(true);
  });

  it("marks an issue resolved when it disappears and retains its history", () => {
    const existing = { key: "d1:tacho", severity: "critical", status: "open", title: "Tacho expired", firstDetectedAt: "2026-11-01T08:00:00.000Z" };
    const result = reconcileAlertState([], { "d1:tacho": existing }, now);
    expect(result.resolved).toHaveLength(1);
    expect(result.next["d1:tacho"].status).toBe("resolved");
    expect(result.next["d1:tacho"].firstDetectedAt).toBe(existing.firstDetectedAt);
    expect(result.shouldNotify).toBe(false);
  });
});
