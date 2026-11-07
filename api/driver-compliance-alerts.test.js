import { describe, expect, it } from "vitest";
import { buildReport } from "./driver-compliance-alerts.js";

describe("daily driver compliance report", () => {
  const now = new Date("2026-11-07T08:00:00.000Z");

  it("includes compliance dates expiring within seven days and all overdue dates", () => {
    const drivers = [
      { _docId: "d1", name: "Seven Day Driver" },
      { _docId: "d2", name: "Overdue Driver" },
      { _docId: "d3", name: "Eight Day Driver" },
    ];
    const records = [
      { driverId: "d1", driverName: "Seven Day Driver", licenceValidTo: "2026-11-14" },
      { driverId: "d2", driverName: "Overdue Driver", tachoCardExpiry: "2026-11-06" },
      { driverId: "d3", driverName: "Eight Day Driver", licenceValidTo: "2027-11-07", cpcExpiry: "2026-11-15" },
    ];

    const report = buildReport(records, drivers, now);

    expect(report.totals.complianceDue).toBe(2);
    expect(report.detail).toContain("Seven Day Driver");
    expect(report.detail).toContain("Overdue Driver");
    expect(report.detail).not.toContain("Eight Day Driver");
    expect(report.summary.join(" ")).toContain("within 7 days or expired");
  });

  it("retains active driver points thresholds and ignores inactive drivers", () => {
    const drivers = [
      { _docId: "d1", name: "Active Driver" },
      { _docId: "d2", name: "Inactive Driver", active: false },
    ];
    const records = [
      { driverId: "d1", driverName: "Active Driver", endorsements: [
        { offenceCode: "SP30", points: 6, offenceDate: "2026-01-01", expiryDate: "2027-01-01" },
      ] },
      { driverId: "d2", driverName: "Inactive Driver", endorsements: [
        { offenceCode: "SP30", points: 12, offenceDate: "2026-01-01", expiryDate: "2027-01-01" },
      ] },
    ];

    const report = buildReport(records, drivers, now);

    expect(report.totals.activeDrivers).toBe(1);
    expect(report.totals.thresholds).toBe(1);
    expect(report.detail).toContain("Active Driver");
    expect(report.detail).not.toContain("Inactive Driver");
  });
});
