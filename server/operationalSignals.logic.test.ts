import { describe, expect, it } from "vitest";
import { buildOperationalSignals } from "../client/src/lib/operationalSignals";

describe("operational signal summary", () => {
  it("surfaces cover and ownership gaps without requiring manual team check-ins", () => {
    const result = buildOperationalSignals({ rota: [{ workDate: "2026-09-04", assignmentType: "early" }], tasks: [{ workDate: "2026-09-04", status: "pending", assignedTeamMemberId: null }], helpRequests: [{ status: "open", ownerTeamMemberId: null }], readiness: [{ pulseDate: "2026-09-04", teamMemberId: 1 }] }, "2026-09-04");
    expect(result).toMatchObject({ uncoveredDuties: ["core", "late", "on_call"], unownedTasks: [{ workDate: "2026-09-04", status: "pending", assignedTeamMemberId: null }], unownedHelpRequests: [{ status: "open", ownerTeamMemberId: null }], total: 5 });
    expect(result).not.toHaveProperty("missingReadiness");
  });
});
