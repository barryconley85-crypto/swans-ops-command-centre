import { describe, expect, it } from "vitest";
import { buildOperationalReport, reportDefinitions } from "../client/src/lib/operationalReports";

const state = {
  members: [{ id: 1, userId: "barry", displayName: "Barry Conley", status: "active" }, { id: 2, userId: "coral", displayName: "Coral Hughes", status: "active" }],
  tasks: [{ title: "Ring round", workDate: "2026-09-04", status: "complete", completedByName: "Coral Hughes", completedByTeamMemberId: 2, assignedTeamMemberId: 1, dueAt: Date.UTC(2026, 8, 4, 16) }, { title: "Zeelo sheet", workDate: "2026-09-04", status: "blocked", priority: "high", assignedTeamMemberId: 1, dueAt: Date.UTC(2026, 8, 4, 15), blockedReason: "Awaiting operator update" }],
  rota: [{ workDate: "2026-09-04", teamMemberId: 1, assignmentType: "early" }, { workDate: "2026-09-04", teamMemberId: 2, assignmentType: "holiday" }],
  onCallItems: [{ workDate: "2026-09-04", title: "Late client call", priority: "high", status: "open", ownerTeamMemberId: 2 }],
  handovers: [], issues: [], readiness: [],
};

describe("operational report builder", () => {
  const filter = { rangeStart: "2026-09-04", rangeEnd: "2026-09-04", asOf: Date.UTC(2026, 8, 4, 17) };
  it("uses actual completer attribution for contribution reports", () => {
    const report = buildOperationalReport("work-by-person", state, filter);
    expect(report.rows.find(row => row["Team member"] === "Coral Hughes")?.["Recorded completions"]).toBe(1);
  });
  it("finds coverage gaps and records holiday entries without treating them as fabricated data", () => {
    const coverage = buildOperationalReport("rota-coverage", state, filter);
    const holiday = buildOperationalReport("holiday-calendar", state, filter);
    const conflicts = buildOperationalReport("holiday-conflicts", state, filter);
    expect(coverage.rows[0]).toMatchObject({ Date: "2026-09-04", Core: "Missing", "On-call": "Missing" });
    expect(holiday.rows[0]).toMatchObject({ "Team member": "Coral Hughes", Availability: "Holiday" });
    expect(conflicts.rows[0]).toMatchObject({ "Unavailable colleague": "Coral Hughes", "Missing required cover": "Core, Late, On-call" });
  });
  it("combines high-priority operational risks for a lead review", () => {
    const report = buildOperationalReport("risk-radar", state, filter);
    expect(report.rows.map(row => row.Category)).toEqual(expect.arrayContaining(["Overdue task", "Blocked task", "Coverage gap", "Open on-call action"]));
  });
  it("does not offer a report that treats manual readiness pulses as required daily input", () => {
    expect(reportDefinitions.map(definition => definition.id)).not.toContain("readiness-gap");
  });
});
