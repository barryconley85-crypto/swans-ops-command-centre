const DATE_FIELDS = [
  ["licenceValidTo", "Driving licence", "critical", true],
  ["consentExpiry", "DVLA consent", "critical", true],
  ["cpcExpiry", "Driver CPC", "critical", true, "cpcApplicability"],
  ["tachoCardExpiry", "Tachograph card", "critical", true, "tachoApplicability"],
  // Training expiry is optional in the existing record form; only evaluate it when recorded.
  ["trainingExpiry", "Training", "high", false],
];

const DAY = 24 * 60 * 60 * 1000;
const dateKey = (date) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export function daysUntilDate(value, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return Math.round((Date.parse(value + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / DAY);
}

function section88CoversLicence(record, today) {
  if (!record?.section88Confirmed || !record?.section88EvidenceReceived || record.section88Ended || !record.section88DvlaReceivedDate) return false;
  const age = daysUntilDate(record.section88DvlaReceivedDate, today);
  return age !== null && age <= 0 && age >= -365;
}

function addIssue(issues, issue) {
  issues[issue.key] = { status: "open", firstDetectedAt: null, lastDetectedAt: null, ...issue };
}

function severityForDays(days, base) {
  if (days < 0) return "critical";
  if (days <= 7) return "critical";
  if (days <= 14) return "high";
  if (days <= 30) return "warning";
  return base;
}

export function evaluateCompliance(records = [], drivers = [], now = new Date()) {
  const today = dateKey(now);
  const byDriverId = new Map(records.filter(record => record.driverId).map(record => [String(record.driverId), record]));
  const byName = new Map(records.map(record => [String(record.driverName || "").trim().toLowerCase(), record]));
  const issues = {};
  const activeDrivers = drivers.filter(driver => driver.active !== false);

  for (const driver of activeDrivers) {
    const id = String(driver._docId || driver.id || driver.driverId || "");
    const name = driver.name || "Unnamed driver";
    const record = byDriverId.get(id) || byName.get(String(name).trim().toLowerCase());
    if (!record) {
      addIssue(issues, {
        key: `driver:${id}:record-missing`, driverId: id, driverName: name,
        category: "record-completeness", severity: "critical",
        title: "No compliance record exists", detail: "Create and verify the driver's compliance record.",
        action: "Obtain and record the required driver compliance information.",
      });
      continue;
    }

    for (const [field, label, baseSeverity, alertWhenMissing, applicabilityField] of DATE_FIELDS) {
      if (applicabilityField && record[applicabilityField] === "not-applicable") continue;
      if (field === "licenceValidTo" && section88CoversLicence(record, today)) continue;
      const value = record[field];
      const days = daysUntilDate(value, today);
      const missing = !value;
      if (missing && !alertWhenMissing) continue;
      if (missing || days !== null && days <= 30) {
        const state = missing ? "missing" : days < 0 ? "expired" : "due";
        addIssue(issues, {
          key: `driver:${id}:date:${field}`, driverId: id, driverName: name,
          category: missing ? "data-quality" : "document-expiry", field, severity: missing ? "high" : severityForDays(days, baseSeverity),
          title: missing ? `${label} date not recorded` : days < 0 ? `${label} expired` : `${label} due in ${days} days`,
          detail: missing ? `No ${label.toLowerCase()} expiry date is recorded. Confirm whether this document applies and update the record if required.` : `${label} expiry date: ${value}.`,
          action: missing ? `Confirm whether a ${label.toLowerCase()} record is required and update it if needed. Do not infer driving eligibility from this alert.` : `Verify the ${label.toLowerCase()} status and update the driver record.`,
          dueDate: value || null, daysRemaining: days, state,
        });
      } else if (days === null) {
        addIssue(issues, {
          key: `driver:${id}:date:${field}`, driverId: id, driverName: name,
          category: "data-quality", field, severity: "high",
          title: `${label} date is invalid`, detail: `The stored value "${String(value)}" is not a valid YYYY-MM-DD date.`,
          action: `Check the source document and correct the ${label.toLowerCase()} date.`,
          state: "invalid",
        });
      }
    }

    const endorsements = Array.isArray(record.endorsements) ? record.endorsements : [];
    const currentEndorsements = endorsements.filter(item => {
      const days = daysUntilDate(item.expiryDate, today);
      return days === null || days >= 0;
    });
    const points = currentEndorsements.reduce((sum, item) => sum + (Number(item.points) || 0), 0);
    if (points >= 6) {
      const level = points >= 12 ? 12 : points >= 9 ? 9 : 6;
      addIssue(issues, {
        key: `driver:${id}:points-threshold:${level}`, driverId: id, driverName: name,
        category: "licence-endorsements", severity: points >= 12 ? "critical" : points >= 9 ? "high" : "warning",
        title: `${points} current penalty points`,
        detail: `The recorded current total is ${points} points. Threshold reached: ${level}+.`,
        action: "Verify the DVLA record, assess suitability to drive and follow the company's escalation process.",
        points, threshold: level, state: "active",
      });
    }

    for (const item of currentEndorsements) {
      const days = daysUntilDate(item.expiryDate, today);
      if (days !== null && days >= 0 && days <= 30) {
        const identity = [item.offenceCode || "endorsement", item.offenceDate || "unknown-date", item.expiryDate || "unknown-expiry"].join(":");
        addIssue(issues, {
          key: `driver:${id}:points-expiry:${identity}`, driverId: id, driverName: name,
          category: "licence-endorsements", severity: days <= 7 ? "high" : "warning",
          title: `${item.points || 0} points due to expire in ${days} days`,
          detail: `${item.offenceCode || "Endorsement"} expires on ${item.expiryDate}.`,
          action: "Recalculate the current points total after expiry and verify it against the DVLA record.",
          dueDate: item.expiryDate, daysRemaining: days, state: "due",
        });
      }
      const created = Number(item.createdAt || item.addedAt || 0);
      if (created && created >= now.getTime() - DAY) {
        const identity = [item.offenceCode || "endorsement", item.offenceDate || "", item.expiryDate || "", item.points || 0].join(":");
        addIssue(issues, {
          key: `driver:${id}:new-endorsement:${identity}`, driverId: id, driverName: name,
          category: "licence-endorsements", severity: "high",
          title: "New endorsement recorded",
          detail: `${item.offenceCode || "Endorsement"}, ${item.points || 0} points, offence date ${item.offenceDate || "not recorded"}.`,
          action: "Verify the endorsement against the DVLA record and reassess the driver's points total.",
          state: "new",
        });
      }
    }
  }

  return { evaluatedAt: now.toISOString(), date: today, activeDrivers: activeDrivers.length, issues: Object.values(issues) };
}

export function reconcileAlertState(currentIssues = [], previousIssues = {}, now = new Date()) {
  const current = Object.fromEntries(currentIssues.map(issue => [issue.key, issue]));
  const opened = [];
  const escalated = [];
  const resolved = [];
  const next = {};

  for (const [key, issue] of Object.entries(current)) {
    const previous = previousIssues[key];
    const firstDetectedAt = previous?.firstDetectedAt || now.toISOString();
    const severityChanged = previous && previous.severity !== issue.severity;
    const stateChanged = previous && previous.state !== issue.state;
    const entry = {
      ...issue,
      status: "open",
      firstDetectedAt,
      lastDetectedAt: now.toISOString(),
      acknowledgedAt: previous?.acknowledgedAt || null,
      acknowledgedBy: previous?.acknowledgedBy || null,
      owner: previous?.owner || null,
      ownerAssignedAt: previous?.ownerAssignedAt || null,
      ownerAssignedBy: previous?.ownerAssignedBy || null,
      resolution: null,
    };
    next[key] = entry;
    if (!previous || previous.status === "resolved") opened.push(entry);
    else if (severityChanged || stateChanged) escalated.push(entry);
  }

  for (const [key, previous] of Object.entries(previousIssues)) {
    if (!current[key] && previous.status !== "resolved") {
      resolved.push({ ...previous, status: "resolved", resolvedAt: now.toISOString(), resolution: "Condition no longer detected by the compliance check." });
      next[key] = resolved[resolved.length - 1];
    } else if (!current[key]) {
      next[key] = previous;
    }
  }

  return { next, opened, escalated, resolved, shouldNotify: opened.length > 0 || escalated.length > 0 };
}
