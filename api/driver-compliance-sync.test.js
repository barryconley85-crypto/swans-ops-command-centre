import { describe, expect, it } from "vitest";
import { buildSyncPlan } from "./driver-compliance-sync.js";

describe("two-way driver compliance sync planning", () => {
  it("sends the later Gate Check date to Ops", () => {
    const plan = buildSyncPlan(
      { licenceExpiry: "2032-03-18" },
      { licenceValidTo: "2031-03-18" },
    );
    expect(plan.changes[0]).toMatchObject({
      gateCheckDate: "2032-03-18",
      opsDate: "2031-03-18",
      selectedDate: "2032-03-18",
      target: "Ops",
    });
    expect(plan.updatesRequired).toBe(1);
  });

  it("sends the later Ops date to Gate Check", () => {
    const plan = buildSyncPlan(
      { cpcExpiry: "2028-09-09" },
      { cpcExpiry: "2029-09-09" },
    );
    expect(plan.changes[1]).toMatchObject({
      gateCheckDate: "2028-09-09",
      opsDate: "2029-09-09",
      selectedDate: "2029-09-09",
      target: "Gate Check",
    });
  });

  it("fills a missing date from the system that has a valid date", () => {
    const plan = buildSyncPlan(
      { tachoExpiry: "" },
      { tachoCardExpiry: "2027-01-31" },
    );
    expect(plan.changes[2]).toMatchObject({
      gateCheckDate: "Not recorded",
      opsDate: "2027-01-31",
      selectedDate: "2027-01-31",
      target: "Gate Check",
    });
  });

  it("does not change matching dates", () => {
    const plan = buildSyncPlan(
      { licenceExpiry: "2031-03-18", cpcExpiry: "2029-09-09", tachoExpiry: "2027-01-31" },
      { licenceValidTo: "2031-03-18", cpcExpiry: "2029-09-09", tachoCardExpiry: "2027-01-31" },
    );
    expect(plan.updatesRequired).toBe(0);
    expect(plan.changes.every(item => item.target === "No change")).toBe(true);
  });

  it("never replaces a later date with an older date", () => {
    const plan = buildSyncPlan(
      { licenceExpiry: "2032-03-18", cpcExpiry: "2030-09-09", tachoExpiry: "2028-01-31" },
      { licenceValidTo: "2031-03-18", cpcExpiry: "2029-09-09", tachoCardExpiry: "2027-01-31" },
    );
    expect(plan.changes.every(item => item.target === "Ops")).toBe(true);
    expect(plan.changes.map(item => item.selectedDate)).toEqual(["2032-03-18", "2030-09-09", "2028-01-31"]);
  });

  it("rejects malformed dates rather than syncing them", () => {
    expect(() => buildSyncPlan({ licenceExpiry: "31/03/2031" }, {})).toThrow("invalid date");
  });
});
