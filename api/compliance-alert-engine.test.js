import { describe, expect, it, vi } from "vitest";
import { daysUntilDate, endorsementFingerprint, evaluateCompliance, reconcileAlertState } from "./compliance-alert-engine.js";
import { buildNotificationEventKey, isAlertActivationEnabled, managerIssuePreview } from "./compliance-early-warning.js";
import complianceEarlyWarningHandler from "./compliance-early-warning.js";

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
      cpcExpiry: "2026-11-17",
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


  it("uses 40, 20, 10 day and daily 7-day-or-less stages for CPC and driving licence", () => {
    const driver = { _docId: "d1", name: "Expiry Driver" };
    const dateFor = days => new Date(Date.parse("2026-11-07T00:00:00.000Z") + days * 86400000).toISOString().slice(0, 10);
    for (const days of [40, 20, 10, 7, 6, 1, 0, -1]) {
      const record = { driverId: "d1", driverName: "Expiry Driver", licenceValidTo: dateFor(days), cpcExpiry: dateFor(days) };
      const issues = evaluateCompliance([record], [driver], now).issues.filter(issue => ["licenceValidTo", "cpcExpiry"].includes(issue.field));
      expect(issues).toHaveLength(2);
      expect(issues.every(issue => issue.daysRemaining === days)).toBe(true);
    }
    for (const days of [39, 21, 19, 11, 9, 8]) {
      const record = { driverId: "d1", driverName: "Expiry Driver", licenceValidTo: dateFor(days), cpcExpiry: dateFor(days) };
      const issues = evaluateCompliance([record], [driver], now).issues.filter(issue => ["licenceValidTo", "cpcExpiry"].includes(issue.field));
      expect(issues).toHaveLength(0);
    }
  });

  it("fingerprints endorsement records independent of source ordering", () => {
    const a = [{ offenceCode: "SP30", offenceDate: "2026-01-01", expiryDate: "2027-01-01", points: 3 }, { offenceCode: "CU80", offenceDate: "2026-02-01", expiryDate: "2027-02-01", points: 6 }];
    expect(endorsementFingerprint(a)).toBe(endorsementFingerprint([...a].reverse()));
    expect(endorsementFingerprint(a)).not.toBe(endorsementFingerprint([{ ...a[0], points: 6 }, a[1]]));
  });

  it("does not treat optional blank training dates as missing compliance, and keeps missing tachograph dates as data-quality warnings", () => {
    const record = {
      driverId: "d1", driverName: "Test Driver",
      licenceValidTo: "2027-06-01",
      consentExpiry: "2027-06-01",
      cpcExpiry: "2027-06-01",
      tachoCardExpiry: "",
      trainingExpiry: "",
    };
    const issues = evaluateCompliance([record], [{ _docId: "d1", name: "Test Driver" }], now).issues;
    expect(issues.some(issue => issue.field === "trainingExpiry")).toBe(false);
    expect(issues.find(issue => issue.field === "tachoCardExpiry")).toMatchObject({
      category: "data-quality",
      severity: "high",
      title: "Tachograph card date not recorded",
    });
  });

  it("suppresses missing CPC and tachograph alerts only when a manager records not-applicable status", () => {
    const driver = { _docId: "d1", name: "Cleaner" };
    const base = { driverId: "d1", driverName: "Cleaner", licenceValidTo: "2027-06-01", consentExpiry: "2027-06-01" };
    const notRequired = evaluateCompliance([{ ...base, cpcApplicability: "not-applicable", cpcApplicabilityReason: "Role does not require CPC", tachoApplicability: "not-applicable", tachoApplicabilityReason: "Role does not require tachograph use" }], [driver], now).issues;
    expect(notRequired.some(issue => ["cpcExpiry", "tachoCardExpiry"].includes(issue.field))).toBe(false);

    const stillRequired = evaluateCompliance([{ ...base, cpcApplicability: "required", tachoApplicability: "required" }], [driver], now).issues;
    expect(stillRequired.filter(issue => ["cpcExpiry", "tachoCardExpiry"].includes(issue.field))).toHaveLength(2);
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
    expect(opened.opened[0].notificationVersion).toBe(1);
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
    expect(escalated.escalated[0].notificationVersion).toBe(2);
    expect(escalated.shouldNotify).toBe(true);

    const resolved = reconcileAlertState([], escalated.next, new Date("2026-11-09T08:00:00.000Z"));
    const reopened = reconcileAlertState([first], resolved.next, new Date("2026-11-10T08:00:00.000Z"));
    expect(reopened.opened[0].notificationVersion).toBe(3);
  });


  it("treats a point-total or endorsement-record change as an escalation even within the same threshold", () => {
    const first = { key: "d1:points-current", severity: "high", state: "active", points: 9, threshold: 9, endorsementFingerprint: "sp30:3" };
    const opened = reconcileAlertState([first], {}, now);
    const changed = reconcileAlertState([{ ...first, points: 10, endorsementFingerprint: "sp30:3|cu80:1" }], opened.next, new Date("2026-11-08T08:00:00.000Z"));
    expect(changed.escalated).toHaveLength(1);
    expect(changed.escalated[0].notificationVersion).toBe(2);
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

describe("compliance notification safety", () => {
  it("keeps event keys stable across retries and item ordering, but changes them for a new transition", () => {
    const a = { key: "d1:cpc", notificationVersion: 1, severity: "warning", state: "due", firstDetectedAt: "2026-11-07T08:00:00.000Z", lastDetectedAt: "2026-11-07T09:00:00.000Z" };
    const b = { key: "d2:tacho", notificationVersion: 1, severity: "critical", state: "expired", firstDetectedAt: "2026-11-07T08:00:00.000Z" };
    expect(buildNotificationEventKey([a, b])).toBe(buildNotificationEventKey([{ ...b }, { ...a, firstDetectedAt: "2026-11-08T08:00:00.000Z", lastDetectedAt: "2026-11-07T10:00:00.000Z" }]));
    expect(buildNotificationEventKey([a])).not.toBe(buildNotificationEventKey([{ ...a, notificationVersion: 2, severity: "critical" }]));
  });

  it("keeps production writes and email disabled until explicit activation", () => {
    expect(isAlertActivationEnabled({})).toBe(false);
    expect(isAlertActivationEnabled({ COMPLIANCE_ALERTS_ENABLED: "TRUE" })).toBe(false);
    expect(isAlertActivationEnabled({ COMPLIANCE_ALERTS_ENABLED: "true" })).toBe(true);
  });

  it("returns capped issue details only for authenticated manual checks", () => {
    const issues = Array.from({ length: 101 }, (_, index) => ({ key: `driver:${index}` }));
    expect(managerIssuePreview("GET", issues)).toEqual({});
    const preview = managerIssuePreview("POST", issues);
    expect(preview.issues).toHaveLength(100);
    expect(preview.issuesTruncated).toBe(true);
  });

  it("uses the manager's Firebase token for a read-only preview without a service account", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", "");
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).includes("identitytoolkit.googleapis.com")) {
        return { ok: true, status: 200, json: async () => ({ users: [{ email: "bc@swanstravel.com" }] }) };
      }
      const collection = String(url).split("/").at(-1).split("?")[0];
      const documents = collection === "ops_drivers" ? [{
        name: "projects/swans-ops-command-centre/databases/(default)/documents/ops_drivers/d1",
        fields: { name: { stringValue: "Driver" }, active: { booleanValue: true } },
      }] : [];
      return { ok: true, status: 200, json: async () => ({ documents }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };

    try {
      await complianceEarlyWarningHandler({ method: "POST", headers: { authorization: "Bearer manager-id-token" } }, result);
      expect(result.statusCode).toBe(200);
      expect(result.body).toMatchObject({ status: "preview_only", persisted: false, notified: false, activeDrivers: 1, openIssues: 1 });
      const firestoreCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("firestore.googleapis.com"));
      expect(firestoreCalls).toHaveLength(4);
      expect(firestoreCalls.every(([, options]) => options.headers.Authorization === "Bearer manager-id-token" && !options.method)).toBe(true);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("GOOGLE_MAILER"))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});



describe("production-safe manual evaluation preview", () => {
  it("uses the manager token and never acquires a lock, writes, or emails", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("COMPLIANCE_ALERTS_ENABLED", "true");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", "");
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).includes("identitytoolkit.googleapis.com")) {
        return { ok: true, status: 200, json: async () => ({ users: [{ email: "bc@swanstravel.com" }] }) };
      }
      const collection = String(url).split("/").at(-1).split("?")[0];
      const documents = collection === "ops_drivers" ? [{
        name: "projects/swans-ops-command-centre/databases/(default)/documents/ops_drivers/d1",
        fields: { name: { stringValue: "Driver" }, active: { booleanValue: true } },
      }] : [];
      return { ok: true, status: 200, json: async () => ({ documents }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };

    try {
      await complianceEarlyWarningHandler({ method: "POST", query: { preview: "1" }, headers: { authorization: "Bearer manager-id-token" } }, result);
      expect(result.statusCode).toBe(200);
      expect(result.body).toMatchObject({ status: "preview_only", persisted: false, notified: false, activeDrivers: 1, openIssues: 1 });
      const firestoreCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("firestore.googleapis.com"));
      expect(firestoreCalls).toHaveLength(3);
      expect(firestoreCalls.every(([, options]) => options.headers.Authorization === "Bearer manager-id-token" && !options.method)).toBe(true);
      expect(firestoreCalls.some(([url]) => String(url).includes("ops_compliance_runtime"))).toBe(false);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("GOOGLE_MAILER"))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("compliance evaluator concurrency lease", () => {
  it("claims an unoccupied lease with create-only precondition", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { acquireEvaluationLease } = await import("./compliance-early-warning.js");
      const owner = await acquireEvaluationLease("service-token", now.getTime());
      expect(owner).toMatch(/^[0-9a-f-]{36}$/i);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toContain("currentDocument.exists=false");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("declines to acquire an unexpired lease", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ fields: { owner: { stringValue: "other-run" }, leaseUntil: { integerValue: String(now.getTime() + 1000) } }, updateTime: "2026-11-07T08:00:00Z" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { acquireEvaluationLease } = await import("./compliance-early-warning.js");
      expect(await acquireEvaluationLease("service-token", now.getTime())).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
