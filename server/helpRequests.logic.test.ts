import { describe, expect, it } from "vitest";
import { buildHelpRequest, canResolveHelpRequest } from "../client/src/lib/helpRequests";

describe("help request workflow", () => {
  const requester = { id: 11, userId: "user-11", displayName: "Coral Hughes" };
  const payload = buildHelpRequest({ requestType: "cover", priority: "high", title: "Need late cover", detail: "Please cover the 09:00–18:00 duty.", workDate: "2026-09-04", requestedDuty: "late" }, requester, 99, 1234);
  it("creates an owned, concise request with an auditable starting state", () => {
    expect(payload).toMatchObject({ requestType: "cover", status: "open", requestedByUserId: "user-11", ownerTeamMemberId: null, workDate: "2026-09-04" });
  });
  it("normalizes a direct shared-register help request into an unowned open request", () => {
    const help = buildHelpRequest({ requestType: "help", priority: "normal", title: "  Need a second check  ", detail: "  Please review the change before it is shared.  ", workDate: null, requestedDuty: null }, requester, 100, 1235);
    expect(help).toMatchObject({ requestType: "help", priority: "normal", title: "Need a second check", detail: "Please review the change before it is shared.", ownerTeamMemberId: null, status: "open", workDate: null, requestedDuty: null });
  });
  it("allows the requester, accepting owner or manager to close the request", () => {
    expect(canResolveHelpRequest(payload, requester, false)).toBe(true);
    expect(canResolveHelpRequest({ ...payload, ownerTeamMemberId: 12 }, { id: 12 }, false)).toBe(true);
    expect(canResolveHelpRequest(payload, { id: 13 }, false)).toBe(false);
    expect(canResolveHelpRequest(payload, { id: 13 }, true)).toBe(true);
  });
});
