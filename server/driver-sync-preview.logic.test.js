import { describe, expect, it } from "vitest";
import { buildDriverSyncPreview, validDate } from "./driver-sync-preview.logic.js";

describe("driver sync preview", () => {
  it("uses the later expiry in either direction without writing", () => {
    const result = buildDriverSyncPreview(
      [{_docId:"ops-1",name:"Lee Simpson"}],
      [{_docId:"compliance-1",driverId:"ops-1",licenceValidTo:"2030-01-01",cpcExpiry:"2029-09-09",tachoCardExpiry:"2027-01-31"}],
      [{id:"lee",name:"Lee Simpson",licenceExpiry:"2031-03-18",cpcExpiry:"2029-09-09",tachoExpiry:"2027-01-31"}]
    );
    expect(result.rows[0].status).toBe("changes-preview");
    expect(result.rows[0].dates[0]).toMatchObject({latest:"2031-03-18",updateOps:true,updateGate:false});
    expect(result.rows[0].dates[1].action).toBe("matched");
    expect(result.mode).toBe("read-only-preview");
  });
  it("flags duplicate names and does not guess", () => {
    const result=buildDriverSyncPreview([{_docId:"1",name:"Lee Simpson"},{_docId:"2",name:"Lee Simpson"}],[],[{id:"lee",name:"Lee Simpson"}]);
    expect(result.rows[0].status).toBe("duplicate-match");
  });
  it("flags invalid dates for review", () => {
    expect(validDate("31/03/2027").invalid).toBe(true);
  });
  it("does not treat missing dates as a deletion", () => {
    const result=buildDriverSyncPreview([{_docId:"1",name:"Lee Simpson"}],[{driverId:"1",licenceValidTo:"2030-01-01"}],[{id:"lee",name:"Lee Simpson"}]);
    expect(result.rows[0].dates[0]).toMatchObject({latest:"2030-01-01",updateGate:true,updateOps:false});
  });
});
