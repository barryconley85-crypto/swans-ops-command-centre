import { createSign } from "node:crypto";

const PROJECT_ID = "swans-ops-command-centre";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const BANK_HOLIDAYS_URL = "https://www.gov.uk/bank-holidays.json";
const APP_URL = (process.env.APP_BASE_URL || "https://swans-ops-command-centre.vercel.app").replace(/\/$/, "");
const OFFSET_FORMATTER = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "longOffset", hour: "2-digit", hourCycle: "h23" });
const STATIC_BANK_HOLIDAYS = [
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
];

function dateInLondon(timestamp) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function isWorkingMinute(timestamp, holidays = STATIC_BANK_HOLIDAYS) {
  const p = dateInLondon(timestamp);
  const date = `${p.year}-${p.month}-${p.day}`;
  const minute = Number(p.hour) * 60 + Number(p.minute);
  return isWorkingDay(timestamp, holidays) && minute >= 540 && minute < 1020;
}

export function isWorkingDay(timestamp, holidays = STATIC_BANK_HOLIDAYS) {
  const p = dateInLondon(timestamp);
  const date = `${p.year}-${p.month}-${p.day}`;
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(p.weekday) && !holidays.includes(date);
}

export function workingMinutesBetween(from, to, holidays = STATIC_BANK_HOLIDAYS) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  let count = 0;
  let date = localDateKey(from);
  const lastDate = localDateKey(to - 1);
  while (date <= lastDate) {
    if (isWeekday(date) && !holidays.includes(date)) {
      const offset = londonOffsetMinutes(date);
      const dayStart = Date.parse(`${date}T09:00:00Z`) - offset * 60_000;
      const dayEnd = Date.parse(`${date}T17:00:00Z`) - offset * 60_000;
      const overlapStart = Math.max(from, dayStart);
      const overlapEnd = Math.min(to, dayEnd);
      if (overlapEnd > overlapStart) count += Math.max(0, Math.ceil(overlapEnd / 60_000) - Math.ceil(overlapStart / 60_000));
    }
    date = nextDate(date);
  }
  return count;
}

function localDateKey(timestamp) {
  const p = dateInLondon(timestamp);
  return `${p.year}-${p.month}-${p.day}`;
}

function isWeekday(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function nextDate(date) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function londonOffsetMinutes(date) {
  const noon = Date.parse(`${date}T12:00:00Z`);
  const zone = OFFSET_FORMATTER.formatToParts(noon).find(part => part.type === "timeZoneName")?.value || "GMT";
  const match = zone.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const magnitude = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? magnitude : -magnitude;
}

export function complaintMilestones(complaint, now, holidays = STATIC_BANK_HOLIDAYS) {
  if (complaint.recordType !== "complaint" || complaint.stage === "closed") return [];
  const receivedAt = Number(complaint.receivedAt);
  if (!Number.isFinite(receivedAt) || receivedAt <= 0) return [];
  const acknowledgementDueAt = Number(complaint.acknowledgementDueAt) || workingDeadline(receivedAt, 8 * 60, holidays);
  const responseDueAt = Number(complaint.responseDueAt) || workingDeadline(receivedAt, 40 * 60, holidays);
  const candidates = [
    { kind: "acknowledgement", dueAt: acknowledgementDueAt, complete: Boolean(complaint.acknowledgedAt), marker: "acknowledgementEmailAlertedAt", legacyMarker: "acknowledgementWarningSentAt", threshold: 120 },
    { kind: "response", dueAt: responseDueAt, complete: Boolean(String(complaint.clientResponse || "").trim()), marker: "responseEmailAlertedAt", legacyMarker: "responseWarningSentAt", threshold: 240 },
  ];
  return candidates.filter(item => !item.complete && !complaint[item.marker] && !complaint[item.legacyMarker] && Number.isFinite(item.dueAt) && workingMinutesBetween(now, item.dueAt, holidays) <= item.threshold);
}

function workingDeadline(from, minutes, holidays) {
  let cursor = from;
  let remaining = minutes;
  while (remaining > 0) {
    const date = localDateKey(cursor);
    if (!isWeekday(date) || holidays.includes(date)) {
      cursor = workDayStart(nextDate(date));
      continue;
    }
    const p = dateInLondon(cursor);
    const minuteOfDay = Number(p.hour) * 60 + Number(p.minute);
    if (minuteOfDay < 540) {
      cursor = workDayStart(date);
      continue;
    }
    if (minuteOfDay >= 1020) {
      cursor = workDayStart(nextDate(date));
      continue;
    }
    const available = 1020 - minuteOfDay;
    if (remaining <= available) return cursor + remaining * 60_000;
    remaining -= available;
    cursor = workDayStart(nextDate(date));
  }
  return cursor;
}

function workDayStart(date) {
  return Date.parse(`${date}T09:00:00Z`) - londonOffsetMinutes(date) * 60_000;
}

export async function getEnglandWalesBankHolidays(fetcher = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const result = await fetcher(BANK_HOLIDAYS_URL, { signal: controller.signal });
    if (!result.ok) throw new Error("The England and Wales bank holiday calendar could not be loaded.");
    const data = await result.json();
    const events = data["england-and-wales"]?.events;
    if (!Array.isArray(events)) throw new Error("The England and Wales bank holiday calendar response was invalid.");
    return events.map(event => event.date).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date));
  } finally {
    clearTimeout(timeout);
  }
}

function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return Date.parse(value.timestampValue);
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}

function configuredServiceAccount() {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
    return raw ? JSON.parse(Buffer.from(raw, "base64").toString("utf8")) : null;
  } catch {
    return null;
  }
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function googleAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    sub: account.client_email,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key, "base64url")}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!tokenResponse.ok) throw new Error("Firebase service authentication was not accepted.");
  return (await tokenResponse.json()).access_token;
}

async function listCollection(token, collection) {
  const documents = [];
  let pageToken = "";
  do {
    const url = `${FIRESTORE}/${collection}?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const result = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!result.ok) throw new Error(`Could not read the ${collection} records from Firebase.`);
    const body = await result.json();
    for (const doc of body.documents || []) documents.push({ path: doc.name, id: doc.name.split("/").pop(), ...decodeFields(doc.fields) });
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return documents;
}

function activeRecipient(members, firstName) {
  const matches = members.filter(member => String(member.status || "").toLowerCase() === "active"
    && new RegExp(`^${firstName}\\b`, "i").test(String(member.displayName || ""))
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(member.email || "").trim()));
  return matches.length === 1 ? String(matches[0].email).trim().toLowerCase() : null;
}

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function emailContent(complaint, kind, dueAt, remaining) {
  const acknowledgement = kind === "acknowledgement";
  const label = acknowledgement ? "Client acknowledgement" : "Full client response";
  const overdue = dueAt <= Date.now();
  const remainingText = overdue ? "SLA deadline has passed" : `${Math.floor(remaining / 60)}h ${remaining % 60}m of working time remaining`;
  const dueText = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }).format(new Date(dueAt));
  const subject = `Swans Ops | SLA ${overdue ? "overdue" : "warning"} | ${complaint.reference} | ${label}`;
  const text = ["SWANS TRAVEL | OPS COMMAND CENTRE", `COMPLAINT SLA ${overdue ? "OVERDUE" : "WARNING"}`, "", `${complaint.reference} | ${complaint.title || "Complaint"}`, `Client: ${complaint.client || "Not recorded"}`, `Milestone: ${label}`, `Deadline: ${dueText}`, `Time remaining: ${remainingText}`, "", "Please review the complaint and record the required action.", `Open Complaints Management: ${APP_URL}/complaints`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f3;font-family:Arial,Helvetica,sans-serif;color:#24352e"><div style="max-width:680px;margin:0 auto;padding:24px 12px"><div style="background:#123d3b;border-radius:16px 16px 0 0;padding:26px 28px;color:#fff"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#9ce0d3">SWANS TRAVEL | OPS COMMAND CENTRE</div><h1 style="font-size:24px;margin:13px 0 8px">Complaint SLA ${overdue ? "overdue" : "warning"}</h1><p style="margin:0;color:#e0efeb;font-size:14px">${escapeHtml(label)} · ${escapeHtml(complaint.reference)}</p></div><div style="background:#fff;padding:24px 22px;border:1px solid #e0e8e3;border-top:0"><h2 style="font-size:18px;color:#174b46">${escapeHtml(complaint.title || "Complaint")}</h2><p>Client: ${escapeHtml(complaint.client || "Not recorded")}</p><p>Deadline: ${escapeHtml(dueText)}</p><p><strong>${escapeHtml(remainingText)}</strong></p><p><a href="${escapeHtml(APP_URL + "/complaints")}">Open Complaints Management</a></p><p style="font-size:11px;color:#68776f">Automatic notification from the Swans Travel Ops Command Centre.</p></div></div></body></html>`;
  return { subject, text, html };
}

async function sendMail(payload) {
  const result = await fetch(process.env.GOOGLE_MAILER_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: process.env.GOOGLE_MAILER_SHARED_SECRET, ...payload }),
  });
  const body = await result.json().catch(() => ({}));
  if (!result.ok || body.ok !== true) throw new Error(body.error || "Google Apps Script mailer rejected the alert.");
  return body;
}

async function markEmailAlertSent(token, documentPath, field, timestamp) {
  const url = `https://firestore.googleapis.com/v1/${documentPath}?updateMask.fieldPaths=${encodeURIComponent(field)}`;
  const result = await fetch(url, {
    method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { [field]: { integerValue: String(timestamp) } } }),
  });
  if (!result.ok) throw new Error("The warning was accepted by the mailer but its delivery marker could not be saved.");
}

export default async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  const secret = process.env.CRON_SECRET;
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return response.status(401).json({ error: "Unauthorised complaint SLA trigger" });
  const dryRun = request.query?.dryRun === "1";
  const required = ["FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", "GOOGLE_MAILER_URL", "GOOGLE_MAILER_SHARED_SECRET"];
  if (required.some(key => !process.env[key])) return response.status(503).json({ error: "Firebase or the Google Apps Script mailer is not configured." });
  try {
    const account = configuredServiceAccount();
    if (!account?.private_key || !account?.client_email) throw new Error("The Firebase service account configuration is invalid.");
    const holidays = await getEnglandWalesBankHolidays();
    const now = Date.now();
    if (!isWorkingDay(now, holidays)) return response.status(200).json({ status: "outside_working_days", sent: 0 });
    const token = await googleAccessToken(account);
    const [complaints, members] = await Promise.all([listCollection(token, "ops_issues"), listCollection(token, "ops_members")]);
    const stephen = activeRecipient(members, "Stephen");
    const coral = activeRecipient(members, "Coral");
    if (!stephen || !coral) return response.status(409).json({ error: "Could not uniquely identify active Stephen and Coral email recipients. No alerts were sent." });
    const recipients = [...new Set(["bc@swanstravel.com", stephen, coral])];
    let sent = 0;
    let skipped = 0;
    const errors = [];
    for (const complaint of complaints) {
      const milestones = complaintMilestones(complaint, now, holidays);
      if (!milestones.length) { skipped++; continue; }
      for (const milestone of milestones) {
        if (dryRun) { sent++; continue; }
        try {
          const content = emailContent(complaint, milestone.kind, milestone.dueAt, workingMinutesBetween(now, milestone.dueAt, holidays));
          await sendMail({
            eventKey: `complaint-sla-${complaint.reference}-${milestone.kind}`,
            subject: content.subject, text: content.text, html: content.html, to: recipients,
          });
          await markEmailAlertSent(token, complaint.path, milestone.marker, now);
          sent++;
        } catch (error) {
          errors.push({ reference: complaint.reference || complaint.id, milestone: milestone.kind, error: error instanceof Error ? error.message : "Alert failed" });
        }
      }
    }
    return response.status(errors.length ? 207 : 200).json({ status: dryRun ? "dry_run" : errors.length ? "partial" : "checked", checked: complaints.length, sent: dryRun ? 0 : sent, wouldSend: dryRun ? sent : undefined, skipped, errors });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "Complaint SLA check failed." });
  }
}
